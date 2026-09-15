use eyre::{ContextCompat, Result};
use std::sync::atomic::{AtomicI64, Ordering};
use tauri::{
    window::{ProgressBarState, ProgressBarStatus},
    Emitter, Manager,
};

/// Last percentage emitted to the UI. The sidecar reports progress very
/// frequently (per audio chunk); forwarding every value saturates the IPC
/// channel and the WebView main thread, which is what made the frame of the
/// window (minimise/maximise/close are JS buttons) stop responding while a
/// transcription was running. Only whole-percent changes are sent now.
static LAST_PROGRESS: AtomicI64 = AtomicI64::new(-1);

pub(crate) fn set_progress_bar(app_handle: &tauri::AppHandle, progress: Option<f64>) -> Result<()> {
    let window = app_handle.get_webview_window("main").context("get window")?;
    if let Some(progress) = progress {
        tracing::debug!("set_progress_bar {}", progress);
        let whole = progress as i64;
        if LAST_PROGRESS.swap(whole, Ordering::Relaxed) != whole {
            window.emit("transcribe_progress", progress)?;
        }
        if progress > 1.0 {
            window.set_progress_bar(ProgressBarState {
                progress: Some(progress as u64),
                status: if cfg!(target_os = "windows") {
                    None
                } else {
                    Some(ProgressBarStatus::Indeterminate)
                },
            })?;
        }
    } else {
        LAST_PROGRESS.store(-1, Ordering::Relaxed);
        window.set_progress_bar(ProgressBarState {
            progress: Some(0),
            status: Some(ProgressBarStatus::None),
        })?;
    }
    Ok(())
}
