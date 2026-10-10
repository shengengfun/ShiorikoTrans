use crate::error::LogError;
use crate::setup::SonaState;
use crate::sona::{AcquireStep, SonaEvent, SonaLease};
use crate::transcript::{Segment, Transcript};
use eyre::Result;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

use super::{ui::set_progress_bar, CommandError};

/// A single whisper 30s window can take well over 30s to decode on CPU, and
/// whisper only emits a progress event once per window, so a short inactivity
/// timeout would spuriously kill valid slow transcriptions. This is a generous
/// hang detector; a user abort is handled separately.
const HANG_TIMEOUT: Duration = Duration::from_secs(300);

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
    /// Groups the progress and live segments of one request. Parallel batch
    /// transcriptions each use their own id so their events stay separable.
    #[serde(default)]
    pub job_id: Option<String>,
    /// How many inference workers this request may use (1 = run alone).
    #[serde(default)]
    pub max_workers: Option<usize>,
    /// Whether the caller allows splitting a long file into chunks.
    #[serde(default)]
    pub allow_chunking: Option<bool>,
}

/// What a running transcription reports back to whoever started it.
enum StreamUpdate {
    Progress(f64),
    Segment(Segment),
}

#[tauri::command]
pub async fn transcribe(
    app_handle: tauri::AppHandle,
    mut options: TranscribeOptions,
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

    {
        // Every transcription starts from a clean slate: the shared abort flag
        // still holds the state of the previous, cancelled run.
        let state = sona_state.lock().await;
        state.abort.reset();
    }

    // No explicit thread count means "use the hardware": the engine then gets
    // one thread per physical core instead of the old hardcoded default.
    if options.n_threads.unwrap_or(0) <= 0 {
        match tokio::task::spawn_blocking(crate::hardware::cpu_threads).await {
            Ok(threads) => {
                tracing::debug!("using {} threads for {}", threads, options.path);
                options.n_threads = Some(threads as i32);
            }
            Err(error) => tracing::warn!("failed to detect the cpu thread count: {error}"),
        }
    }

    let workers = options.max_workers.unwrap_or(1).clamp(1, crate::hardware::MAX_WORKERS);
    if workers > 1 && options.allow_chunking.unwrap_or(false) {
        match transcribe_chunked(&app_handle, &options, workers).await {
            Ok(Some(transcript)) => return Ok(transcript),
            // Not worth splitting (short file, unusable audio): fall through to
            // the regular single-worker path.
            Ok(None) => {}
            Err(error) => return Err(error),
        }
    }

    let job_id = options.job_id.clone();
    let sink_handle = app_handle.clone();
    let mut on_update = move |update: StreamUpdate| match update {
        StreamUpdate::Progress(percent) => {
            let _ = set_progress_bar(&sink_handle, job_id.as_deref(), Some(percent));
        }
        StreamUpdate::Segment(segment) => {
            let _ = sink_handle
                .emit_to(
                    "main",
                    "new_segment",
                    serde_json::json!({ "jobId": job_id, "segment": segment }),
                )
                .log_error();
        }
    };
    run_request(&app_handle, &options, &mut on_update).await
}

/// Runs one transcription, retrying once when sona reports that its model was
/// unloaded in the meantime (its inactivity timeout fired).
async fn run_request(
    app_handle: &tauri::AppHandle,
    options: &TranscribeOptions,
    on_update: &mut (dyn FnMut(StreamUpdate) + Send),
) -> Result<Transcript, CommandError> {
    let sona_state = app_handle.state::<Mutex<SonaState>>();
    let start = std::time::Instant::now();
    let mut retried = false;

    loop {
        let lease = acquire_worker(&sona_state).await?;
        let id = lease.id;
        let result = stream_events(app_handle, options, &sona_state, &lease, start, on_update).await;
        release_worker(&sona_state, id).await;

        match result {
            Err(error) if error.code == "no_model" && !retried => {
                tracing::warn!("no_model during transcription; reloading the model and retrying once");
                retried = true;
                if let Err(error) = reload_worker(&sona_state, id).await {
                    tracing::error!("failed to reload the model after no_model: {error:#}");
                    return Err(CommandError {
                        code: "no_model".to_string(),
                        message: "The model was unloaded and could not be loaded again".to_string(),
                    });
                }
                continue;
            }
            result => return result,
        }
    }
}

/// Streams one request against one worker and collects its segments.
async fn stream_events(
    app_handle: &tauri::AppHandle,
    options: &TranscribeOptions,
    sona_state: &State<'_, Mutex<SonaState>>,
    lease: &SonaLease,
    start: std::time::Instant,
    on_update: &mut (dyn FnMut(StreamUpdate) + Send),
) -> Result<Transcript, CommandError> {
    let abort = {
        let state = sona_state.lock().await;
        state.abort.clone()
    };

    let stream = match crate::sona::SonaProcess::transcribe_stream(&lease.client, &lease.base_url, options).await {
        Ok(stream) => stream,
        Err(error) => return Err(command_error_from(error)),
    };
    tokio::pin!(stream);

    let mut segments = Vec::new();
    let mut completed = false;

    loop {
        if abort.is_raised() {
            tracing::debug!("transcription aborted by user (pre-select)");
            break;
        }

        // Use select! so the abort notification wakes us up immediately.
        let event_result = tokio::select! {
            biased; // Check abort branch first

            _ = abort.wait() => {
                tracing::debug!("transcription aborted by user (notify)");
                break;
            }

            result = timeout(HANG_TIMEOUT, stream.next()) => {
                match result {
                    Ok(Some(r)) => r,
                    Ok(None) => break,
                    Err(_) => {
                        tracing::warn!("transcription stream timed out after {} seconds of inactivity", HANG_TIMEOUT.as_secs());
                        let _ = set_progress_bar(app_handle, options.job_id.as_deref(), None);
                        let mut state = sona_state.lock().await;
                        state.pool.reset();
                        return Err(CommandError {
                            code: "timeout".to_string(),
                            message: format!("Transcription timed out after {} seconds of inactivity", HANG_TIMEOUT.as_secs()),
                        });
                    }
                }
            }
        };

        if abort.is_raised() {
            tracing::debug!("transcription aborted by user (post-event)");
            break;
        }

        match event_result {
            Ok(SonaEvent::Progress { progress }) => {
                let normalized = if progress <= 1.0 { progress * 100.0 } else { progress };
                on_update(StreamUpdate::Progress(normalized));
            }
            Ok(SonaEvent::Segment {
                start: segment_start,
                end,
                text,
                speaker,
            }) => {
                let segment = Segment {
                    start: (segment_start * 100.0) as i64,
                    stop: (end * 100.0) as i64,
                    text,
                    speaker,
                };
                on_update(StreamUpdate::Segment(segment.clone()));
                segments.push(segment);
            }
            Ok(SonaEvent::Result { .. }) => {
                tracing::debug!("transcription complete");
                completed = true;
            }
            Ok(SonaEvent::Error { code, message }) => {
                tracing::error!("sona transcription error: {}", message);
                let _ = set_progress_bar(app_handle, options.job_id.as_deref(), None);
                return Err(CommandError {
                    code: code.unwrap_or_else(|| "internal_error".to_string()),
                    message,
                });
            }
            Err(error) => {
                tracing::error!("stream error: {:?}", error);
                let _ = set_progress_bar(app_handle, options.job_id.as_deref(), None);
                return Err(CommandError::from(error));
            }
        }
    }

    let _ = set_progress_bar(app_handle, options.job_id.as_deref(), None);

    if !abort.is_raised() && !completed {
        return Err(CommandError {
            code: "internal_error".to_string(),
            message: "Sona transcription stream ended before completion".to_string(),
        });
    }

    Ok(Transcript {
        processing_time_sec: start.elapsed().as_secs(),
        segments,
    })
}

/// Tracks the progress of every chunk of one file so the UI sees a single
/// monotonic percentage for the whole file.
struct ChunkProgress {
    values: StdMutex<Vec<f64>>,
}

impl ChunkProgress {
    fn new(total: usize) -> Self {
        Self {
            values: StdMutex::new(vec![0.0; total]),
        }
    }

    /// Stores one chunk's percentage and returns the mean of all chunks.
    fn update(&self, index: usize, percent: f64) -> f64 {
        let mut values = self.values.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(slot) = values.get_mut(index) {
            *slot = percent;
        }
        let sum: f64 = values.iter().sum();
        sum / values.len().max(1) as f64
    }
}

/// Transcribes a long file as several chunks in parallel.
///
/// Returns `Ok(None)` when the file should not be split (too short, duration
/// unknown, or the audio could not be cut), in which case the caller falls back
/// to the regular path.
async fn transcribe_chunked(
    app_handle: &tauri::AppHandle,
    options: &TranscribeOptions,
    workers: usize,
) -> Result<Option<Transcript>, CommandError> {
    let start = std::time::Instant::now();
    let job_id = options.job_id.clone();

    let duration = match crate::chunked::probe_duration(&options.path).await {
        Ok(duration) => duration,
        Err(error) => {
            tracing::debug!("not splitting {}: {error:#}", options.path);
            return Ok(None);
        }
    };
    if duration < crate::chunked::MIN_TOTAL_SECONDS {
        return Ok(None);
    }
    let plan = match crate::chunked::plan(&options.path, duration, workers).await {
        Ok(plan) => plan,
        Err(error) => {
            tracing::warn!("failed to plan chunks for {}: {error:#}", options.path);
            return Ok(None);
        }
    };
    if plan.chunks.len() < 2 {
        return Ok(None);
    }

    let temp_dir = crate::ffmpeg::get_shiorikotrans_temp_folder().join(format!("chunks-{}", crate::ffmpeg::random_string(8)));
    if let Err(error) = std::fs::create_dir_all(&temp_dir) {
        tracing::warn!("failed to create the chunk folder: {error}");
        return Ok(None);
    }
    let chunk_paths = match crate::chunked::split(&plan, &options.path, &temp_dir).await {
        Ok(paths) => paths,
        Err(error) => {
            tracing::warn!("failed to split {} into chunks: {error:#}", options.path);
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Ok(None);
        }
    };

    tracing::info!(
        "splitting {} into {} chunks ({:.0}s, silence aligned: {})",
        options.path,
        plan.chunks.len(),
        duration,
        plan.silence_aligned
    );

    let progress = Arc::new(ChunkProgress::new(plan.chunks.len()));
    let tasks = chunk_paths.iter().enumerate().map(|(index, chunk_path)| {
        let mut chunk_options = options.clone();
        chunk_options.path = chunk_path.to_string_lossy().into_owned();
        // Each chunk runs on its own worker; a chunk is never split further.
        chunk_options.max_workers = Some(1);
        chunk_options.allow_chunking = Some(false);
        let app = app_handle.clone();
        let progress = progress.clone();
        let job_id = job_id.clone();

        async move {
            let sink_handle = app.clone();
            let mut on_update = move |update: StreamUpdate| match update {
                StreamUpdate::Progress(percent) => {
                    let mean = progress.update(index, percent);
                    let _ = set_progress_bar(&sink_handle, job_id.as_deref(), Some(mean));
                }
                // Segments are emitted in file order once everything is merged;
                // streaming them here would interleave the chunks.
                StreamUpdate::Segment(_) => {}
            };
            run_request(&app, &chunk_options, &mut on_update).await
        }
    });

    // Every task waits for a free worker inside `acquire_worker`, so the pool
    // size alone bounds how many chunks run at once.
    let results = futures::future::join_all(tasks).await;
    let _ = std::fs::remove_dir_all(&temp_dir);

    let mut segments: Vec<Segment> = Vec::new();
    for (index, result) in results.into_iter().enumerate() {
        let transcript = match result {
            Ok(transcript) => transcript,
            Err(error) => {
                let _ = set_progress_bar(app_handle, job_id.as_deref(), None);
                return Err(error);
            }
        };
        let offset = plan.chunks[index].offset_centis();
        segments.extend(transcript.segments.into_iter().map(|mut segment| {
            segment.start += offset;
            segment.stop += offset;
            segment
        }));
    }
    segments.sort_by_key(|segment| segment.start);

    let _ = set_progress_bar(app_handle, job_id.as_deref(), None);
    // The live view receives the merged segments in order, which is why the
    // per-chunk sink above is silent.
    for segment in &segments {
        let _ = app_handle
            .emit_to(
                "main",
                "new_segment",
                serde_json::json!({ "jobId": job_id, "segment": segment }),
            )
            .log_error();
    }

    let elapsed = start.elapsed().as_secs();
    tracing::info!("chunked transcription finished in {}s ({} segments)", elapsed, segments.len());
    Ok(Some(Transcript {
        processing_time_sec: elapsed,
        segments,
    }))
}

/// Checks out a worker for the current request, waiting for one to free up when
/// the pool is saturated.
async fn acquire_worker(sona_state: &State<'_, Mutex<SonaState>>) -> Result<SonaLease, CommandError> {
    let mut grew = false;
    loop {
        if sona_state.lock().await.abort.is_raised() {
            return Err(aborted_error());
        }

        let step = { sona_state.lock().await.pool.plan_acquire() };
        match step {
            Ok(AcquireStep::Lease(lease)) => return Ok(lease),
            Ok(AcquireStep::Grow) => {
                if !grew {
                    grew = true;
                    // Spawning + loading a second model takes a moment; doing it
                    // here keeps the first file running while the pool grows.
                    let mut state = sona_state.lock().await;
                    if let Err(error) = state.pool.grow().await {
                        tracing::warn!("could not grow the sona pool: {error:#}");
                    }
                    continue;
                }
            }
            Ok(AcquireStep::Wait) => {}
            Err(error) => {
                return Err(CommandError {
                    code: "no_model".to_string(),
                    message: error.to_string(),
                });
            }
        }

        // Every worker is busy: poll briefly. The wait is bounded by the
        // duration of the shortest running transcription.
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}

async fn release_worker(sona_state: &State<'_, Mutex<SonaState>>, id: u64) {
    let mut state = sona_state.lock().await;
    state.pool.release(id);
}

async fn reload_worker(sona_state: &State<'_, Mutex<SonaState>>, id: u64) -> Result<()> {
    let mut state = sona_state.lock().await;
    state.pool.forget_model(id);
    state.pool.reload_worker(id).await
}

fn aborted_error() -> CommandError {
    CommandError {
        code: "aborted".to_string(),
        message: "Transcription aborted".to_string(),
    }
}

fn command_error_from(error: eyre::Error) -> CommandError {
    match error.downcast_ref::<crate::sona::SonaApiError>() {
        Some(api_error) => CommandError {
            code: api_error.code.clone(),
            message: api_error.message.clone(),
        },
        None => CommandError::from(error),
    }
}
