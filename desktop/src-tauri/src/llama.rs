//! Self-hosted translation runtime.
//!
//! Translation with a local model used to mean "install llama.cpp and run
//! `llama-server` yourself" — the app only downloaded the GGUF and printed a
//! command, so the feature was effectively unusable. This module closes that
//! gap: it fetches a llama.cpp build into the app data folder, starts
//! `llama-server` with the selected model on a free port, and stops it again.
//!
//! Layout: `<app data>/bin/llama/llama-server[.exe]` plus the DLLs shipped in
//! the release archive. Nothing is bundled in the installer, which keeps the
//! slim package slim.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use eyre::{bail, Context, ContextCompat, Result};
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Managed state: the running server, if any.
#[derive(Default)]
pub struct LlamaServerState(pub Mutex<Option<Running>>);

pub struct Running {
    pub child: Child,
    pub port: u16,
    pub model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaStatus {
    pub installed: bool,
    pub path: Option<String>,
    pub running: bool,
    pub port: Option<u16>,
    pub model: Option<String>,
    /// Rough size of the download, shown before starting it.
    pub download_size_mb: u32,
}

const DOWNLOAD_SIZE_MB: u32 = 70;
/// Loading a multi-GB model from disk can take a while on the first run.
const START_TIMEOUT: Duration = Duration::from_secs(180);

fn server_binary_name() -> &'static str {
    if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

/// `<app data>/bin/llama` — download target for the runtime.
fn runtime_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("cannot resolve the app data folder")?
        .join("bin")
        .join("llama");
    Ok(dir)
}

/// Locate `llama-server`: our own download first, then whatever is on PATH, so a
/// user-provided build keeps working.
pub fn resolve_server(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = runtime_dir(app) {
        let local = dir.join(server_binary_name());
        if local.is_file() {
            return Some(local);
        }
    }
    which::which("llama-server").ok()
}

/// Archive name for the current platform, most capable first.
fn asset_preferences() -> Vec<&'static str> {
    if cfg!(windows) {
        if crate::cmd::app::is_avx2_enabled() {
            vec!["win-avx2-x64.zip", "win-cpu-x64.zip", "win-cpu-x64.zip"]
        } else {
            vec!["win-cpu-x64.zip"]
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            vec!["macos-arm64.zip"]
        } else {
            vec!["macos-x64.zip"]
        }
    } else if cfg!(target_arch = "aarch64") {
        vec!["ubuntu-arm64.zip"]
    } else {
        vec!["ubuntu-x64.zip"]
    }
}

/// Ask the GitHub API for the newest llama.cpp build and pick the asset that
/// matches this platform. Returns (url, name).
async fn resolve_download() -> Result<(String, String)> {
    let client = reqwest::Client::builder()
        .user_agent("ShiorikoTrans")
        .timeout(Duration::from_secs(30))
        .build()?;
    let response = client
        .get("https://api.github.com/repos/ggml-org/llama.cpp/releases/latest")
        .send()
        .await
        .context("failed to query the llama.cpp releases")?
        .error_for_status()
        .context("the llama.cpp release API returned an error")?;
    let release: serde_json::Value = response.json().await.context("invalid llama.cpp release payload")?;
    let assets = release
        .get("assets")
        .and_then(|value| value.as_array())
        .context("the llama.cpp release has no assets")?;

    let names: Vec<&str> = assets.iter().filter_map(|asset| asset.get("name")?.as_str()).collect();
    // CUDA/Vulkan/SYCL builds need extra runtime DLLs and a supported GPU, so a
    // CPU build is the safe default for the built-in engine.
    let forbidden = ["cuda", "vulkan", "sycl", "hip", "openvino", "kompute"];
    for preferred in asset_preferences() {
        if let Some(name) = names
            .iter()
            .find(|name| name.ends_with(preferred) && !forbidden.iter().any(|blocked| name.contains(blocked)))
        {
            let url = assets
                .iter()
                .find(|asset| asset.get("name").and_then(|value| value.as_str()) == Some(name))
                .and_then(|asset| asset.get("browser_download_url"))
                .and_then(|value| value.as_str())
                .context("the selected asset has no download URL")?;
            return Ok((url.to_owned(), (*name).to_owned()));
        }
    }
    bail!("no matching llama.cpp build found in the latest release");
}

/// Extract an archive with the system `tar` (bsdtar handles zips on Windows and
/// macOS; Linux falls back to `unzip` when available).
fn extract(archive: &Path, destination: &Path) -> Result<()> {
    std::fs::create_dir_all(destination).with_context(|| format!("failed to create {}", destination.display()))?;

    let tar = Command::new("tar")
        .arg("-xf")
        .arg(archive)
        .arg("-C")
        .arg(destination)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();
    match tar {
        Ok(output) if output.status.success() => return Ok(()),
        Ok(output) => tracing::warn!(
            "tar failed to extract {}: {}",
            archive.display(),
            String::from_utf8_lossy(&output.stderr)
        ),
        Err(error) => tracing::warn!("tar unavailable for {}: {error}", archive.display()),
    }

    let unzip = Command::new("unzip")
        .arg("-o")
        .arg(archive)
        .arg("-d")
        .arg(destination)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();
    match unzip {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => bail!("failed to extract the archive: {}", String::from_utf8_lossy(&output.stderr)),
        Err(error) => bail!("neither tar nor unzip could extract the archive: {error}"),
    }
}

#[tauri::command]
pub fn get_llama_status(app: AppHandle, state: tauri::State<'_, LlamaServerState>) -> LlamaStatus {
    let path = resolve_server(&app);
    let guard = state.0.lock().ok();
    let running = guard.as_ref().and_then(|value| value.as_ref());
    LlamaStatus {
        installed: path.is_some(),
        path: path.map(|value| value.to_string_lossy().into_owned()),
        running: running.is_some(),
        port: running.map(|value| value.port),
        model: running.map(|value| value.model.clone()),
        download_size_mb: DOWNLOAD_SIZE_MB,
    }
}

/// Downloads and unpacks the llama.cpp runtime into the app data folder.
#[tauri::command]
pub async fn install_llama_server(app: AppHandle) -> Result<String> {
    if let Some(existing) = resolve_server(&app) {
        return Ok(existing.to_string_lossy().into_owned());
    }
    let destination = runtime_dir(&app)?;
    std::fs::create_dir_all(&destination).with_context(|| format!("failed to create {}", destination.display()))?;

    let (url, name) = resolve_download().await?;
    tracing::info!("downloading llama.cpp runtime {name} from {url}");
    let archive = destination.join(&name);
    crate::cmd::download::download_with_progress(&app, &url, &archive).await?;

    extract(&archive, &destination)?;
    let _ = std::fs::remove_file(&archive);

    let server = resolve_server(&app).context("the archive did not contain llama-server")?;
    // Keep the executable bit for macOS/Linux archives.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&server, std::fs::Permissions::from_mode(0o755));
    }
    Ok(server.to_string_lossy().into_owned())
}

fn free_port() -> Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").context("failed to reserve a port")?;
    Ok(listener.local_addr()?.port())
}

/// Prefers the port the app already points at (so the configured endpoint keeps
/// working) and falls back to any free one.
fn pick_port(preferred: Option<u16>) -> Result<u16> {
    if let Some(port) = preferred {
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
        tracing::warn!("port {port} is busy, falling back to a free one");
    }
    free_port()
}

/// Waits until the server answers on its OpenAI-compatible endpoint.
async fn wait_until_ready(port: u16, timeout: Duration) -> bool {
    let client = match reqwest::Client::builder().timeout(Duration::from_millis(1500)).build() {
        Ok(client) => client,
        Err(_) => return false,
    };
    let url = format!("http://127.0.0.1:{port}/v1/models");
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(response) = client.get(&url).send().await {
            if response.status().is_success() {
                return true;
            }
        }
        tokio::time::sleep(Duration::from_millis(700)).await;
    }
    false
}

/// Starts `llama-server` for a model file and returns the port it listens on.
#[tauri::command]
pub async fn start_llama_server(
    app: AppHandle,
    state: tauri::State<'_, LlamaServerState>,
    model_path: String,
    port: Option<u16>,
    threads: Option<u32>,
    context_size: Option<u32>,
) -> Result<u16> {
    let model = PathBuf::from(&model_path);
    if !model.is_file() {
        bail!("the translation model is missing: {model_path}");
    }
    let server = resolve_server(&app).context("the llama.cpp runtime is not installed yet")?;

    // Already serving this model? Reuse it.
    if let Ok(mut guard) = state.0.lock() {
        if let Some(existing) = guard.as_mut() {
            if existing.model == model_path && existing.child.try_wait().ok().flatten().is_none() {
                return Ok(existing.port);
            }
        }
        if let Some(mut previous) = guard.take() {
            let _ = previous.child.kill();
        }
    }

    let port = pick_port(port)?;
    let threads = threads.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|value| value.get() as u32)
            .unwrap_or(4)
            .min(8)
    });
    let context_size = context_size.unwrap_or(4096);

    let mut command = Command::new(&server);
    command
        .arg("-m")
        .arg(&model)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("-c")
        .arg(context_size.to_string())
        .arg("-t")
        .arg(threads.to_string())
        .arg("--no-webui")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());
    // No console window should flash up on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    if let Some(dir) = server.parent() {
        command.current_dir(dir);
    }

    let child = command
        .spawn()
        .with_context(|| format!("failed to start {}", server.display()))?;
    tracing::info!("llama-server started on port {port} (pid {})", child.id());

    if let Ok(mut guard) = state.0.lock() {
        *guard = Some(Running {
            child,
            port,
            model: model_path.clone(),
        });
    }

    if !wait_until_ready(port, START_TIMEOUT).await {
        stop_llama_server(state)?;
        bail!("the local translation server did not become ready in time");
    }
    Ok(port)
}

#[tauri::command]
pub fn stop_llama_server(state: tauri::State<'_, LlamaServerState>) -> Result<()> {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut running) = guard.take() {
            let _ = running.child.kill();
            let _ = running.child.wait();
        }
    }
    Ok(())
}

/// Called on app exit: the server must not outlive the window.
pub fn kill_on_exit(state: &LlamaServerState) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut running) = guard.take() {
            tracing::info!("stopping llama-server (pid {}) on exit", running.child.id());
            let _ = running.child.kill();
            let _ = running.child.wait();
        }
    }
}
