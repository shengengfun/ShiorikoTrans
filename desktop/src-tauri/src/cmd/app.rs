use crate::config::STORE_FILENAME;
use crate::ffmpeg;
use eyre::{Context, Result};
use std::sync::{Mutex, OnceLock};

/// Return true if there's internet connection
/// timeout in ms
#[tauri::command]
pub async fn is_online(timeout: Option<u64>) -> Result<bool> {
    let timeout = std::time::Duration::from_millis(timeout.unwrap_or(2000));
    let targets = ["1.1.1.1:80", "1.1.1.1:53", "8.8.8.8:53", "8.8.8.8:80"];

    let tasks = targets.iter().map(|addr| async move {
        tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
            .await
            .map(|res| res.is_ok())
            .unwrap_or(false)
    });

    Ok(futures::future::join_all(tasks).await.into_iter().any(|res| res))
}
use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_commit_hash() -> String {
    env!("COMMIT_HASH").to_string()
}

#[tauri::command]
pub fn is_avx2_enabled() -> bool {
    #[cfg(all(any(target_arch = "x86", target_arch = "x86_64"), not(target_os = "macos")))]
    {
        is_x86_feature_detected!("avx2")
    }
    #[cfg(not(all(any(target_arch = "x86", target_arch = "x86_64"), not(target_os = "macos"))))]
    {
        true
    }
}

#[tauri::command]
pub fn track_analytics_event(app_handle: tauri::AppHandle, name: String, props: Option<Value>) -> Result<()> {
    crate::analytics::track_event_handle_with_props(&app_handle, &name, props);
    Ok(())
}

#[tauri::command]
pub fn get_logs_folder(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    Ok(app_handle.path().app_config_dir()?)
}

#[tauri::command]
pub async fn show_log_path(app_handle: tauri::AppHandle) -> Result<()> {
    let log_path = crate::logging::get_log_path(&app_handle)?;
    if log_path.exists() {
        showfile::show_path_in_file_manager(log_path);
    } else if let Some(parent) = log_path.parent() {
        showfile::show_path_in_file_manager(parent);
    }
    Ok(())
}

#[tauri::command]
pub async fn show_temp_path() -> Result<()> {
    let temp_path = ffmpeg::get_shiorikotrans_temp_folder();
    showfile::show_path_in_file_manager(temp_path);
    Ok(())
}

#[tauri::command]
pub fn get_models_folder(app_handle: tauri::AppHandle) -> Result<PathBuf> {
    let store = app_handle.store(STORE_FILENAME)?;

    let models_folder = store.get("models_folder").and_then(|p| p.as_str().map(PathBuf::from));
    if let Some(models_folder) = models_folder {
        tracing::debug!("models folder: {:?}", models_folder);
        return Ok(models_folder);
    }

    // Check for a "models" or "model" folder next to the executable (portable mode)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            for folder_name in ["models", "model"] {
                let candidate = exe_dir.join(folder_name);
                if candidate.is_dir() {
                    tracing::debug!("models folder (portable): {:?}", candidate);
                    return Ok(candidate);
                }
            }
        }
    }

    let path = app_handle.path().app_local_data_dir().context("Can't get data directory")?;
    Ok(path)
}

/// Cached `(cpu %, memory %)` snapshot, refreshed by [`start_system_stats_sampler`].
static SYSTEM_STATS: OnceLock<Mutex<(f32, f32)>> = OnceLock::new();

fn system_stats_cache() -> &'static Mutex<(f32, f32)> {
    SYSTEM_STATS.get_or_init(|| Mutex::new((0.0, 0.0)))
}

#[tauri::command]
pub fn get_system_stats() -> eyre::Result<(f32, f32)> {
    let cache = system_stats_cache();
    let value = *cache.lock().unwrap_or_else(|error| error.into_inner());
    Ok(value)
}

/// Samples CPU / memory once a second on a background thread.
///
/// `sysinfo`'s CPU refresh is a *blocking* call: it waits for its sampling
/// interval to elapse so it can compute a delta against the previous reading.
/// Synchronous Tauri commands execute on the main (event loop) thread, so
/// polling it from the UI every second stalled the window — which is why
/// minimising the window felt broken while a transcription was running. The
/// command above only reads this cached snapshot now.
pub fn start_system_stats_sampler() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        std::thread::Builder::new()
            .name("system-stats".into())
            .spawn(|| {
                let mut system = sysinfo::System::new();
                loop {
                    system.refresh_cpu_usage();
                    system.refresh_memory();
                    let cpu = system.global_cpu_info().cpu_usage();
                    let total = system.total_memory();
                    let memory = if total == 0 {
                        0.0
                    } else {
                        (system.used_memory() as f64 / total as f64 * 100.0) as f32
                    };
                    if let Ok(mut guard) = system_stats_cache().lock() {
                        *guard = (cpu, memory);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                }
            })
            .expect("failed to spawn system stats sampler");
    });
}

#[tauri::command]
pub fn get_logs(app_handle: tauri::AppHandle) -> Result<String> {
    let path = crate::logging::get_log_path(&app_handle)?;
    let content = std::fs::read_to_string(path)?;
    Ok(content)
}

#[tauri::command]
pub fn is_crashed_recently() -> bool {
    tracing::debug!(
        "checking path {}",
        ffmpeg::get_shiorikotrans_temp_folder().join("crash.txt").display()
    );
    ffmpeg::get_shiorikotrans_temp_folder().join("crash.txt").exists()
}

#[tauri::command]
pub fn rename_crash_file() -> Result<()> {
    std::fs::rename(
        ffmpeg::get_shiorikotrans_temp_folder().join("crash.txt"),
        ffmpeg::get_shiorikotrans_temp_folder().join("crash.1.txt"),
    )
    .context("Can't delete file")
}

#[tauri::command]
pub fn type_text(text: String) -> Result<()> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| eyre::eyre!("Failed to create enigo: {}", e))?;
    // Small delay to let the user's key release propagate
    std::thread::sleep(std::time::Duration::from_millis(100));
    enigo.text(&text).map_err(|e| eyre::eyre!("Failed to type text: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_cargo_features() -> Vec<String> {
    Vec::new()
}
