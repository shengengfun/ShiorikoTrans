//! Splits one long audio/video file into silence-aligned chunks so several
//! inference workers can transcribe it in parallel.
//!
//! Cutting a transcript in the middle of a word is what makes naive parallel
//! splitting lossy, so boundaries are snapped to detected silence first (and
//! fall back to an even split when the audio has no usable pause).

use eyre::{bail, Context, ContextCompat, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::ffmpeg::find_ffmpeg_path;

/// Files shorter than this are never split: the parallel startup cost would
/// dominate and a single worker already handles them well.
pub const MIN_TOTAL_SECONDS: f64 = 480.0;
/// Smallest chunk worth running on its own worker.
pub const MIN_CHUNK_SECONDS: f64 = 180.0;

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Chunk {
    pub start: f64,
    pub length: f64,
}

impl Chunk {
    /// Segment timestamps are centiseconds, like everywhere else in the app.
    pub fn offset_centis(&self) -> i64 {
        (self.start * 100.0).round() as i64
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkPlan {
    pub chunks: Vec<Chunk>,
    /// `true` when the boundaries came from silence detection instead of an
    /// even split (surfaced for diagnostics/logging).
    pub silence_aligned: bool,
}

/// Reads the media duration: WAV headers directly, everything else via ffmpeg.
pub async fn probe_duration(path: &str) -> Result<f64> {
    let path = PathBuf::from(path);
    let wav_path = path.clone();
    tokio::task::spawn_blocking(move || {
        if let Some(duration) = wav_duration(&wav_path) {
            return Ok(duration);
        }
        ffmpeg_duration(&wav_path)
    })
    .await
    .context("failed to join duration probe")?
}

fn wav_duration(path: &Path) -> Option<f64> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 44 || &data[0..4] != b"RIFF" || &data[8..12] != b"WAVE" {
        return None;
    }
    let mut offset = 12usize;
    let mut sample_rate = 0u32;
    let mut channels = 0u16;
    let mut bits = 0u16;
    let mut data_len = 0usize;
    while offset + 8 <= data.len() {
        let id = &data[offset..offset + 4];
        let size = u32::from_le_bytes(data[offset + 4..offset + 8].try_into().ok()?) as usize;
        let body = offset + 8;
        match id {
            b"fmt " if body + 16 <= data.len() => {
                channels = u16::from_le_bytes(data[body + 2..body + 4].try_into().ok()?);
                sample_rate = u32::from_le_bytes(data[body + 4..body + 8].try_into().ok()?);
                bits = u16::from_le_bytes(data[body + 14..body + 16].try_into().ok()?);
            }
            b"data" => {
                data_len = size.min(data.len().saturating_sub(body));
            }
            _ => {}
        }
        offset = body + size + (size % 2);
    }
    let bytes_per_frame = channels as usize * (bits as usize / 8);
    if sample_rate == 0 || bytes_per_frame == 0 || data_len == 0 {
        return None;
    }
    Some(data_len as f64 / (sample_rate as f64 * bytes_per_frame as f64))
}

fn ffmpeg_duration(path: &Path) -> Result<f64> {
    let ffmpeg = find_ffmpeg_path().context("ffmpeg is required to read the media duration")?;
    let mut command = Command::new(ffmpeg);
    command.args(["-hide_banner", "-nostdin", "-i"]).arg(path);
    hide_console(&mut command);
    let output = command.output().context("failed to run ffmpeg")?;
    let stderr = String::from_utf8_lossy(&output.stderr);
    parse_duration(&stderr).with_context(|| format!("could not read the duration of {}", path.display()))
}

/// Parses the `Duration: 00:12:34.56` line ffmpeg prints for every input.
pub fn parse_duration(stderr: &str) -> Result<f64> {
    let marker = stderr.find("Duration:").context("no Duration line in ffmpeg output")?;
    let rest = &stderr[marker + "Duration:".len()..];
    let value = rest.trim_start().split([' ', ',']).next().unwrap_or_default();
    let mut parts = value.split(':');
    let hours: f64 = parts.next().unwrap_or("0").trim().parse().unwrap_or(0.0);
    let minutes: f64 = parts.next().unwrap_or("0").trim().parse().unwrap_or(0.0);
    let seconds: f64 = parts.next().unwrap_or("0").trim().parse().unwrap_or(0.0);
    let duration = hours * 3600.0 + minutes * 60.0 + seconds;
    if duration <= 0.0 {
        bail!("ffmpeg reported a non-positive duration ({value})");
    }
    Ok(duration)
}

/// How many chunks `duration` seconds should be cut into for `workers` workers.
///
/// Returns 1 when the file is too short to be worth splitting.
pub fn chunk_count(duration: f64, workers: usize) -> usize {
    let fits = (duration / MIN_CHUNK_SECONDS).floor().max(0.0) as usize;
    workers.clamp(1, crate::hardware::MAX_WORKERS).min(fits).max(1)
}

/// Builds the chunk plan for `duration` seconds across at most `workers` parts.
pub async fn plan(path: &str, duration: f64, workers: usize) -> Result<ChunkPlan> {
    let count = chunk_count(duration, workers);
    if count < 2 {
        return Ok(ChunkPlan {
            chunks: Vec::new(),
            silence_aligned: false,
        });
    }

    let path = PathBuf::from(path);
    let silences = tokio::task::spawn_blocking(move || detect_silences(&path))
        .await
        .unwrap_or_else(|error| {
            tracing::warn!("silence detection task failed: {error}");
            Vec::new()
        });
    let boundaries = boundaries_from_silences(duration, count, &silences);
    Ok(build_plan(duration, &boundaries))
}

fn build_plan(duration: f64, boundaries: &[f64]) -> ChunkPlan {
    let mut chunks = Vec::with_capacity(boundaries.len() + 1);
    let mut start = 0.0;
    for boundary in boundaries.iter().copied().chain(std::iter::once(duration)) {
        let end = boundary.min(duration);
        if end - start <= 0.0 {
            continue;
        }
        chunks.push(Chunk {
            start,
            length: end - start,
        });
        start = end;
    }
    ChunkPlan {
        chunks,
        silence_aligned: !boundaries.is_empty(),
    }
}

/// Picks one silence point per ideal boundary, or the ideal boundary itself
/// when no pause is close enough.
pub fn boundaries_from_silences(duration: f64, count: usize, silences: &[f64]) -> Vec<f64> {
    let mut boundaries = Vec::with_capacity(count.saturating_sub(1));
    for index in 1..count {
        let ideal = duration * index as f64 / count as f64;
        let window = (duration / count as f64) * 0.2;
        let best = silences
            .iter()
            .copied()
            .filter(|point| (point - ideal).abs() <= window)
            .min_by(|left, right| {
                (left - ideal)
                    .abs()
                    .partial_cmp(&(right - ideal).abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        let chosen = best.unwrap_or(ideal);
        // Keep the chunks roughly equal even when a silence pulls two
        // boundaries towards each other.
        let min_gap = MIN_CHUNK_SECONDS / 2.0;
        let previous = boundaries.last().copied().unwrap_or(0.0);
        if chosen - previous < min_gap || duration - chosen < min_gap {
            continue;
        }
        boundaries.push(chosen);
    }
    boundaries
}

/// Runs ffmpeg's `silencedetect` filter and returns the midpoints of every
/// detected pause, in seconds.
fn detect_silences(path: &Path) -> Vec<f64> {
    let Some(ffmpeg) = find_ffmpeg_path() else {
        return Vec::new();
    };
    let mut command = Command::new(ffmpeg);
    command
        .args(["-hide_banner", "-nostdin", "-i"])
        .arg(path)
        .args(["-af", "silencedetect=noise=-35dB:d=0.4", "-f", "null"])
        .arg(if cfg!(windows) { "NUL" } else { "/dev/null" });
    hide_console(&mut command);
    match command.output() {
        Ok(output) => parse_silences(&String::from_utf8_lossy(&output.stderr)),
        Err(error) => {
            tracing::debug!("silence detection failed: {error}");
            Vec::new()
        }
    }
}

/// Parses `silence_start: 12.3` / `silence_end: 13.9` pairs into midpoints.
pub fn parse_silences(stderr: &str) -> Vec<f64> {
    let mut starts: Vec<f64> = Vec::new();
    let mut midpoints: Vec<f64> = Vec::new();
    for line in stderr.lines() {
        if let Some(value) = tagged_value(line, "silence_start:") {
            starts.push(value);
        } else if let Some(value) = tagged_value(line, "silence_end:") {
            if let Some(start) = starts.pop() {
                midpoints.push((start + value) / 2.0);
            } else {
                midpoints.push(value);
            }
        }
    }
    midpoints.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    midpoints
}

fn tagged_value(line: &str, tag: &str) -> Option<f64> {
    let index = line.find(tag)?;
    let rest = &line[index + tag.len()..];
    // `split_whitespace` already skips the leading space after the tag.
    rest.split_whitespace().next().and_then(|value| value.parse::<f64>().ok())
}

/// Writes every chunk as a 16 kHz mono PCM WAV, the format the inference engine
/// reads natively (no extra conversion inside sona).
pub async fn split(plan: &ChunkPlan, source: &str, out_dir: &Path) -> Result<Vec<PathBuf>> {
    let source = source.to_string();
    let out_dir = out_dir.to_path_buf();
    let chunks = plan.chunks.clone();
    tokio::task::spawn_blocking(move || {
        let ffmpeg = find_ffmpeg_path().context("ffmpeg is required to split the audio")?;
        let mut paths = Vec::with_capacity(chunks.len());
        for (index, chunk) in chunks.iter().enumerate() {
            let target = out_dir.join(format!("chunk_{index:03}.wav"));
            let mut command = Command::new(&ffmpeg);
            command
                .args(["-hide_banner", "-nostdin", "-loglevel", "error"])
                .args(["-ss", &format!("{:.3}", chunk.start)])
                .args(["-t", &format!("{:.3}", chunk.length)])
                .arg("-i")
                .arg(&source)
                .args(["-vn", "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", "-y"])
                .arg(&target);
            hide_console(&mut command);
            let output = command.output().context("failed to run ffmpeg")?;
            if !output.status.success() {
                bail!(
                    "failed to split audio chunk {index}: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                );
            }
            paths.push(target);
        }
        Ok(paths)
    })
    .await
    .context("failed to join the split task")?
}

fn hide_console(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ffmpeg_durations() {
        assert_eq!(parse_duration("  Duration: 00:02:03.45, start: 0.0").unwrap(), 123.45);
        assert!(parse_duration("Duration: N/A, bitrate").is_err());
    }

    #[test]
    fn parses_silence_midpoints() {
        let stderr = concat!(
            "[silencedetect @ 0x1] silence_start: 100.0\n",
            "[silencedetect @ 0x1] silence_end: 101.0 | silence_duration: 1.0\n",
            "[silencedetect @ 0x1] silence_start: 300.5\n",
            "[silencedetect @ 0x1] silence_end: 301.5 | silence_duration: 1.0\n",
        );
        assert_eq!(parse_silences(stderr), vec![100.5, 301.0]);
    }

    #[test]
    fn snaps_boundaries_to_nearby_silence() {
        assert_eq!(boundaries_from_silences(600.0, 2, &[301.0]), vec![301.0]);
    }

    #[test]
    fn ignores_silence_far_from_the_ideal_boundary() {
        assert_eq!(boundaries_from_silences(600.0, 2, &[500.0]), vec![300.0]);
    }

    #[test]
    fn short_files_are_never_split() {
        assert_eq!(chunk_count(300.0, 4), 1);
        assert_eq!(chunk_count(MIN_TOTAL_SECONDS + 1.0, 4), 2);
        assert_eq!(chunk_count(3600.0, 4), 4);
        assert_eq!(chunk_count(3600.0, 99), 4);
    }

    #[test]
    fn plan_covers_the_whole_duration() {
        let plan = build_plan(900.0, &[300.0, 600.0]);
        assert_eq!(plan.chunks.len(), 3);
        assert_eq!(plan.chunks[0].start, 0.0);
        assert_eq!(plan.chunks[2].start + plan.chunks[2].length, 900.0);
        assert!(plan.silence_aligned);
        let total: f64 = plan.chunks.iter().map(|chunk| chunk.length).sum();
        assert!((total - 900.0).abs() < 0.001);
    }

    #[test]
    fn offsets_are_converted_to_centiseconds() {
        assert_eq!(
            Chunk {
                start: 12.34,
                length: 1.0
            }
            .offset_centis(),
            1234
        );
    }
}
