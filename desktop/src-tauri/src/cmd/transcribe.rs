use crate::error::LogError;
use crate::setup::SonaState;
use crate::sona::SonaEvent;
use crate::transcript::{Segment, Transcript};
use eyre::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Listener, Manager, State};
use tokio::sync::{Mutex, Notify};
use tokio::time::{timeout, Duration};

use super::{ui::set_progress_bar, CommandError};

#[allow(dead_code)]
#[derive(Deserialize, Serialize, Clone)]
pub struct FfmpegOptions {
    pub normalize_loudness: bool,
    pub custom_command: Option<String>,
}

impl Default for FfmpegOptions {
    fn default() -> Self {
        Self {
            normalize_loudness: true,
            custom_command: None,
        }
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct TranscribeOptions {
    pub path: String,
    pub lang: Option<String>,
    pub verbose: Option<bool>,
    pub n_threads: Option<i32>,
    pub init_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub translate: Option<String>,
    pub max_text_ctx: Option<i32>,
    pub word_timestamps: Option<bool>,
    pub max_sentence_len: Option<i32>,
    pub sampling_strategy: Option<String>,
    pub best_of: Option<i32>,
    pub beam_size: Option<i32>,
    pub diarize_model: Option<String>,
    pub stable_timestamps: Option<bool>,
    pub vad_model: Option<String>,
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    options: TranscribeOptions,
    sona_state: State<'_, Mutex<SonaState>>,
) -> Result<Transcript, CommandError> {
    // Validate file exists before attempting transcription
    let audio_path = PathBuf::from(&options.path);
    if !audio_path.exists() {
        return Err(CommandError {
            code: "invalid_request".to_string(),
            message: format!("Audio file not found: {}", options.path),
        });
    }
    if !audio_path.is_file() {
        return Err(CommandError {
            code: "invalid_request".to_string(),
            message: format!("Path is not a file: {}", options.path),
        });
    }

    let (mut client, mut base_url) = {
        let state = sona_state.lock().await;
        let process = state.process.as_ref().ok_or_else(|| CommandError {
            code: "no_model".to_string(),
            message: "Please load model first".to_string(),
        })?;
        (process.client(), process.base_url())
    }; // lock released here, before any I/O

    let abort_atomic = Arc::new(AtomicBool::new(false));
    let abort_notify = Arc::new(Notify::new());
    let abort_atomic_c = abort_atomic.clone();
    let abort_notify_c = abort_notify.clone();

    let app_handle_c = app_handle.clone();
    let abort_event_id = app_handle.listen("abort_transcribe", move |_| {
        let _ = set_progress_bar(&app_handle_c, None);
        abort_atomic_c.store(true, Ordering::Relaxed);
        // Wake up the stream loop immediately
        abort_notify_c.notify_one();

        // Kill sona process in a blocking thread (taskkill is synchronous)
        let app_handle_kill = app_handle_c.clone();
        tokio::task::spawn_blocking(move || {
            // Use try_install_block to get the runtime, then block on the async lock
            let rt = tokio::runtime::Handle::current();
            rt.block_on(async {
                let sona_state = app_handle_kill.state::<Mutex<SonaState>>();
                let mut state = sona_state.lock().await;
                if let Some(mut process) = state.process.take() {
                    tracing::debug!("killing sona process due to abort_transcribe");
                    process.kill();
                }
                state.loaded_model_path = None;
                state.loaded_gpu_device = None;
            });
        });
    });

    let start = std::time::Instant::now();

    // The sona server unloads the model on its own once its inactivity timeout
    // elapses, and the desktop-side model cache can go stale (see `load_model`).
    // If sona reports `no_model`, reload the model and retry once. This can only
    // happen before streaming starts, so there are no partial segments to worry
    // about.
    let mut no_model_retries = 0u32;
    let transcript_result: Result<Transcript, CommandError> = loop {
        let stream = match crate::sona::SonaProcess::transcribe_stream(&client, &base_url, &options).await {
            Ok(stream) => stream,
            Err(e) => {
                let is_no_model = e
                    .downcast_ref::<crate::sona::SonaApiError>()
                    .is_some_and(|api_err| api_err.code == "no_model");
                if is_no_model && no_model_retries == 0 {
                    tracing::warn!("no_model on transcribe request; reloading model and retrying once");
                    if let Some((new_client, new_base_url)) = reload_model_if_needed(&app_handle, &sona_state).await {
                        client = new_client;
                        base_url = new_base_url;
                        no_model_retries += 1;
                        continue;
                    }
                }
                break Err(if let Some(api_err) = e.downcast_ref::<crate::sona::SonaApiError>() {
                    CommandError {
                        code: api_err.code.clone(),
                        message: api_err.message.clone(),
                    }
                } else {
                    CommandError::from(e)
                });
            }
        };
        tokio::pin!(stream);

        let result: Result<Transcript, CommandError> = async {
            let mut segments = Vec::new();
            let mut completed = false;
            // A single whisper 30s window can take well over 30s to decode on CPU,
            // and whisper only emits a progress event once per window, so a 30s
            // inactivity timeout spuriously killed valid slow transcriptions.
            // Use a generous hang-detector value; user abort is handled separately.
            let normal_timeout = Duration::from_secs(300);

            loop {
                // Check abort flag before waiting on stream
                if abort_atomic.load(Ordering::Relaxed) {
                    tracing::debug!("transcription aborted by user (pre-select)");
                    break;
                }

                // Use select! so abort notification wakes us up immediately
                let event_result = tokio::select! {
                    biased; // Check abort branch first

                    _ = abort_notify.notified() => {
                        tracing::debug!("transcription aborted by user (notify)");
                        break;
                    }

                    result = timeout(normal_timeout, stream.next()) => {
                        match result {
                            Ok(Some(r)) => r,
                            Ok(None) => break,
                            Err(_) => {
                                tracing::warn!("transcription stream timed out after 300 seconds of inactivity");
                                let _ = set_progress_bar(&app_handle, None);
                                let mut state = sona_state.lock().await;
                                if let Some(mut process) = state.process.take() {
                                    process.kill();
                                }
                                state.loaded_model_path = None;
                                state.loaded_gpu_device = None;
                                return Err(CommandError {
                                    code: "timeout".to_string(),
                                    message: "Transcription timed out after 30 seconds of inactivity".to_string(),
                                });
                            }
                        }
                    }
                };

                if abort_atomic.load(Ordering::Relaxed) {
                    tracing::debug!("transcription aborted by user (post-event)");
                    break;
                }

                match event_result {
                    Ok(event) => match event {
                        SonaEvent::Progress { progress } => {
                            let normalized = if progress <= 1.0 { progress * 100.0 } else { progress };
                            let _ = set_progress_bar(&app_handle, Some(normalized));
                        }
                        SonaEvent::Segment {
                            start,
                            end,
                            text,
                            speaker,
                        } => {
                            let segment = Segment {
                                start: (start * 100.0) as i64,
                                stop: (end * 100.0) as i64,
                                text,
                                speaker,
                            };
                            app_handle.emit_to("main", "new_segment", segment.clone()).log_error();
                            segments.push(segment);
                        }
                        SonaEvent::Result { .. } => {
                            tracing::debug!("transcription complete");
                            completed = true;
                        }
                        SonaEvent::Error { code, message } => {
                            tracing::error!("sona transcription error: {}", message);
                            let _ = set_progress_bar(&app_handle, None);
                            return Err(CommandError {
                                code: code.unwrap_or_else(|| "internal_error".to_string()),
                                message,
                            });
                        }
                    },
                    Err(e) => {
                        tracing::error!("stream error: {:?}", e);
                        let _ = set_progress_bar(&app_handle, None);
                        return Err(CommandError::from(e));
                    }
                }
            }

            let _ = set_progress_bar(&app_handle, None);

            if !abort_atomic.load(Ordering::Relaxed) && !completed {
                return Err(CommandError {
                    code: "internal_error".to_string(),
                    message: "Sona transcription stream ended before completion".to_string(),
                });
            }

            let elapsed = start.elapsed();
            Ok(Transcript {
                processing_time_sec: elapsed.as_secs(),
                segments,
            })
        }
        .await;

        if no_model_retries == 0 {
            if let Err(err) = &result {
                if err.code == "no_model" {
                    tracing::warn!("no_model during transcription; reloading model and retrying once");
                    if let Some((new_client, new_base_url)) = reload_model_if_needed(&app_handle, &sona_state).await {
                        client = new_client;
                        base_url = new_base_url;
                        no_model_retries += 1;
                        continue;
                    }
                }
            }
        }
        break result;
    };

    app_handle.unlisten(abort_event_id);
    transcript_result
}

/// Reloads the model that was previously loaded (per `SonaState`) into the
/// sona server. Used to self-heal when sona reports `no_model` because its
/// inactivity unload timeout fired between transcription requests. Returns the
/// fresh client/base_url in case `load_model` respawned sona (e.g. GPU
/// fallback to CPU), or `None` if there is nothing to reload / reload failed.
async fn reload_model_if_needed(
    app_handle: &tauri::AppHandle,
    sona_state: &State<'_, Mutex<SonaState>>,
) -> Option<(reqwest::Client, String)> {
    let (model_path, gpu_device, unload_timeout_minutes) = {
        let state = sona_state.lock().await;
        let Some(model_path) = state.loaded_model_path.clone() else {
            return None;
        };
        (model_path, state.loaded_gpu_device, state.unload_timeout_minutes)
    };
    match crate::cmd::sona_cmd::load_model(app_handle.clone(), model_path, gpu_device, unload_timeout_minutes).await {
        Ok(_) => {
            // Re-fetch client/base_url in case load_model respawned sona.
            let state = sona_state.lock().await;
            state.process.as_ref().map(|process| (process.client(), process.base_url()))
        }
        Err(e) => {
            tracing::error!("failed to reload model after no_model: {:#}", e);
            None
        }
    }
}
