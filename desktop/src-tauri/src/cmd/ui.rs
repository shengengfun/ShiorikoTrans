use eyre::{ContextCompat, Result};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    Emitter, Manager,
};

/// Last percentage emitted per job. The sidecar reports progress very
/// frequently (per audio chunk); forwarding every value saturates the IPC
/// channel and the WebView main thread, which is what made the frame of the
/// window (minimise/maximise/close are JS buttons) stop responding while a
/// transcription was running. Only whole-percent changes are sent now.
///
/// The key is the job id: the parallel batch runner has several transcriptions
/// in flight at once, and each one drives its own row in the UI.
static JOB_PROGRESS: OnceLock<Mutex<HashMap<String, i64>>> = OnceLock::new();

/// Last aggregate value pushed to the window/taskbar progress indicator.
static LAST_AGGREGATE: AtomicI64 = AtomicI64::new(-1);

fn jobs() -> &'static Mutex<HashMap<String, i64>> {
    JOB_PROGRESS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Reports the progress of one transcription job.
///
/// `job_id` is `None` for the single-file (home) transcription, so its events
/// carry a null job id and the batch rows ignore them.
pub(crate) fn set_progress_bar(app_handle: &tauri::AppHandle, job_id: Option<&str>, progress: Option<f64>) -> Result<()> {
    let window = app_handle.get_webview_window("main").context("get window")?;
    let key = job_id.unwrap_or_default().to_string();
    let aggregate = {
        let mut active = jobs().lock().unwrap_or_else(|error| error.into_inner());
        match progress {
            Some(value) => {
                let whole = value as i64;
                if active.get(&key) != Some(&whole) {
                    active.insert(key, whole);
                    tracing::debug!("set_progress_bar {value} for job {job_id:?}");
                    window.emit(
                        "transcribe_progress",
                        serde_json::json!({ "jobId": job_id, "progress": value }),
                    )?;
                }
            }
            None => {
                active.remove(&key);
            }
        }
        if active.is_empty() {
            None
        } else {
            Some(active.values().sum::<i64>() as f64 / active.len() as f64)
        }
    };

    match aggregate {
        Some(value) => {
            let whole = value as i64;
            if LAST_AGGREGATE.swap(whole, Ordering::Relaxed) != whole {
                window.set_progress_bar(ProgressBarState {
                    progress: Some(value.max(0.0) as u64),
                    status: if cfg!(target_os = "windows") {
                        None
                    } else {
                        Some(ProgressBarStatus::Indeterminate)
                    },
                })?;
            }
        }
        None => {
            LAST_AGGREGATE.store(-1, Ordering::Relaxed);
            window.set_progress_bar(ProgressBarState {
                progress: Some(0),
                status: Some(ProgressBarStatus::None),
            })?;
        }
    }
    Ok(())
}
