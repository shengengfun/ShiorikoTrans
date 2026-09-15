//! Optional runtime dependencies.
//!
//! The full installer bundles `ffmpeg`, but it is by far the largest file in
//! the package (~83 MB compressed to a fifth of that). The slim installer leaves
//! it out and these commands let the UI report what is missing and fetch it on
//! demand into the app data folder, where the normal ffmpeg lookup finds it.
//!
//! The binaries come from the public `eugeneware/ffmpeg-static` release assets
//! (single-file, per-platform, no archive extraction needed).

use eyre::{Context, ContextCompat, Result};
use serde::Serialize;
use tauri::Manager;

use crate::ffmpeg::{ffmpeg_download_url, installed_ffmpeg_path, make_executable, resolve_ffmpeg, FfmpegSource};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub found: bool,
    /// `bundled` | `downloaded` | `system` (absent when not found).
    pub source: Option<FfmpegSource>,
    pub path: Option<String>,
    /// Approximate download size in MB, shown before downloading.
    pub download_size_mb: u32,
}

/// Where the on-demand download lands (`<app data>/bin/ffmpeg[.exe]`).
#[tauri::command]
pub fn get_ffmpeg_status() -> Result<FfmpegStatus> {
    let resolved = resolve_ffmpeg();
    Ok(FfmpegStatus {
        found: resolved.is_some(),
        source: resolved.as_ref().map(|(_, source)| *source),
        path: resolved.map(|(path, _)| path.to_string_lossy().into_owned()),
        download_size_mb: 83,
    })
}

/// Downloads ffmpeg into the app data folder and returns its path.
///
/// Progress is reported through the usual `download_progress` event, so the
/// shared progress toast works without any extra plumbing.
#[tauri::command]
pub async fn install_ffmpeg(app_handle: tauri::AppHandle) -> Result<String> {
    let target = installed_ffmpeg_path().context("cannot resolve the app data folder")?;
    if target.is_file() {
        return Ok(target.to_string_lossy().into_owned());
    }
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .with_context(|| format!("failed to create {}", parent.display()))?;
    }

    // A previously bundled copy can be reused instead of downloading again
    // (e.g. the full installer was replaced by the slim one).
    if let Some((existing, _)) = resolve_ffmpeg() {
        return Ok(existing.to_string_lossy().into_owned());
    }

    let url = ffmpeg_download_url()?;
    tracing::info!("downloading ffmpeg from {}", url);
    crate::cmd::download::download_file(app_handle.clone(), url, target.to_string_lossy().into_owned())
        .await
        .context("failed to download ffmpeg")?;
    make_executable(&target)?;

    // The sidecar receives ffmpeg as an env var when it is spawned, so a running
    // instance would keep reporting "ffmpeg not found". Drop it; the next model
    // load respawns it with the freshly downloaded binary.
    {
        let state = app_handle.state::<tokio::sync::Mutex<crate::setup::SonaState>>();
        let mut guard = state.lock().await;
        if let Some(mut process) = guard.process.take() {
            tracing::debug!("restarting sona so it picks up the new ffmpeg path");
            process.kill();
        }
        guard.loaded_model_path = None;
        guard.loaded_gpu_device = None;
    }

    tracing::info!("ffmpeg installed at {}", target.display());
    Ok(target.to_string_lossy().into_owned())
}
