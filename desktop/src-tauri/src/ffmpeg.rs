use chrono::Local;
use eyre::{bail, ContextCompat, Result};
use rand::distr::Alphanumeric;
use rand::Rng;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use which::which;

/// Where a runtime-downloaded ffmpeg lives (`<app data>/bin/ffmpeg[.exe]`).
///
/// The "slim" installer ships without ffmpeg (it is ~83 MB on its own) and the
/// app offers to fetch it on demand, so this location has to be part of the
/// normal lookup — set once during startup.
static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_app_data_dir(dir: PathBuf) {
    let _ = APP_DATA_DIR.set(dir);
}

/// `<app data>/bin/ffmpeg[.exe]` — also the download target.
pub fn installed_ffmpeg_path() -> Option<PathBuf> {
    Some(APP_DATA_DIR.get()?.join("bin").join(EXECUTABLE_NAME))
}

/// Legacy location (`<app data>/ffmpeg[.exe]`), kept for older installs.
fn legacy_installed_ffmpeg_path() -> Option<PathBuf> {
    Some(APP_DATA_DIR.get()?.join(EXECUTABLE_NAME))
}

/// How an ffmpeg binary was found — surfaced in the settings UI.
#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FfmpegSource {
    /// Next to the app / inside its resources (full installer).
    Bundled,
    /// Downloaded on demand into the app data folder (slim installer).
    Downloaded,
    /// Found on `PATH` (e.g. installed by the user or the system package).
    System,
}

/// Resolve ffmpeg together with where it came from.
pub fn resolve_ffmpeg() -> Option<(PathBuf, FfmpegSource)> {
    for (candidate, source) in [
        (installed_ffmpeg_path(), FfmpegSource::Downloaded),
        (legacy_installed_ffmpeg_path(), FfmpegSource::Downloaded),
    ] {
        if let Some(path) = candidate {
            if path.is_file() {
                return Some((path, source));
            }
        }
    }

    if let Some(path) = bundled_ffmpeg_path() {
        return Some((path, FfmpegSource::Bundled));
    }

    which(EXECUTABLE_NAME).ok().map(|path| (path, FfmpegSource::System))
}

fn bundled_ffmpeg_path() -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    let ffmpeg_in_cwd = cwd.join(EXECUTABLE_NAME);
    if ffmpeg_in_cwd.is_file() {
        return Some(ffmpeg_in_cwd);
    }

    let exe_path = std::env::current_exe().ok()?;
    let exe_folder = exe_path.parent()?;
    let ffmpeg_in_exe_folder = exe_folder.join(EXECUTABLE_NAME);
    if ffmpeg_in_exe_folder.is_file() {
        return Some(ffmpeg_in_exe_folder);
    }

    #[cfg(target_os = "macos")]
    {
        let resources_folder = exe_folder.join("../Resources");
        let ffmpeg_in_resources = resources_folder.join(EXECUTABLE_NAME);
        if ffmpeg_in_resources.is_file() {
            return Some(ffmpeg_in_resources);
        }
    }

    None
}

/// Public, single-file static builds — no archive extraction needed at runtime.
const FFMPEG_DOWNLOAD_TAG: &str = "b6.1.1";

pub fn ffmpeg_download_url() -> Result<String> {
    let asset = if cfg!(target_os = "windows") {
        "ffmpeg-win32-x64"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "ffmpeg-darwin-arm64"
        } else {
            "ffmpeg-darwin-x64"
        }
    } else if cfg!(target_arch = "aarch64") {
        "ffmpeg-linux-arm64"
    } else {
        "ffmpeg-linux-x64"
    };
    Ok(format!(
        "https://github.com/eugeneware/ffmpeg-static/releases/download/{FFMPEG_DOWNLOAD_TAG}/{asset}"
    ))
}

/// Mark a freshly downloaded binary as executable (no-op on Windows).
pub fn make_executable(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = std::fs::metadata(path)?.permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions)?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

pub fn find_ffmpeg_path() -> Option<PathBuf> {
    resolve_ffmpeg().map(|(path, _)| path)
}

pub fn get_local_time() -> String {
    let now = Local::now();
    now.format("%Y-%m-%d %H-%M-%S").to_string()
}

pub fn random_string(length: usize) -> String {
    rand::rng().sample_iter(&Alphanumeric).take(length).map(char::from).collect()
}

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(not(windows))]
const EXECUTABLE_NAME: &str = "ffmpeg";

#[cfg(windows)]
const EXECUTABLE_NAME: &str = "ffmpeg.exe";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn get_shiorikotrans_temp_folder() -> PathBuf {
    use chrono::Local;
    let current_datetime = Local::now();
    let formatted_datetime = current_datetime.format("%Y-%m-%d").to_string();
    let dir = std::env::temp_dir().join(format!("shiorikotrans_temp_{}", formatted_datetime));
    if std::fs::create_dir_all(&dir).is_ok() {
        return dir;
    }
    std::env::temp_dir()
}

pub fn normalize(input: PathBuf, output: PathBuf, additional_ffmpeg_args: Option<Vec<String>>) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    tracing::debug!("ffmpeg path is {}", ffmpeg_path.display());

    let mut cmd = Command::new(ffmpeg_path);
    let cmd = cmd.stderr(Stdio::piped()).args([
        "-i",
        input.to_str().context("tostr")?,
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
    ]);

    cmd.args(additional_ffmpeg_args.unwrap_or_default());

    cmd.args([output.to_str().context("tostr")?, "-hide_banner", "-y", "-loglevel", "error"]);

    tracing::debug!("cmd: {:?}", cmd);

    let cmd = cmd.stdin(Stdio::null());

    #[cfg(windows)]
    let cmd = cmd.creation_flags(CREATE_NO_WINDOW);

    let mut pid = cmd.spawn()?;
    if !pid.wait()?.success() {
        let mut stderr_output = String::new();
        if let Some(ref mut stderr) = pid.stderr {
            stderr.take(1000).read_to_string(&mut stderr_output)?;
        }
        bail!("unable to convert file: {:?} args: {:?}", stderr_output, cmd.get_args());
    }

    if !output.exists() {
        bail!("seems like ffmpeg failed for some reason. output not exists")
    }
    Ok(())
}

pub fn merge_wav_files(a: PathBuf, b: PathBuf, dst: PathBuf) -> Result<()> {
    let ffmpeg_path = find_ffmpeg_path().context("ffmpeg not found")?;
    let output = dst.to_str().context("tostr")?;

    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-i",
        a.to_str().context("tostr")?,
        "-i",
        b.to_str().context("tostr")?,
        "-filter_complex",
        "amix=inputs=2:duration=shortest",
        "-ac",
        "2",
        output,
        "-hide_banner",
        "-y",
        "-loglevel",
        "error",
    ])
    .stdin(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut pid = cmd.spawn()?;
    if !pid.wait()?.success() {
        bail!("unable to merge files");
    }
    Ok(())
}
