//! Built-in neural machine translation.
//!
//! Translation used to be bolted onto the app as "point it at an
//! OpenAI-compatible server": the user had to install llama.cpp, download a
//! multi-gigabyte chat GGUF and keep a server running before a single sentence
//! could be translated. That is why it never really worked.
//!
//! This module is a real translation engine instead — a model that only knows
//! how to translate. `NLLB-200-distilled-600M` (200 languages, exported to int8
//! ONNX) runs in-process on the ONNX Runtime that is already bundled for the
//! SenseVoice engine, so there is no server, no API key, no configuration and no
//! network access after the one-time download.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use eyre::{bail, Context, ContextCompat, Result};
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::{DynValue, Tensor};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokenizers::Tokenizer;

use crate::cmd::download::download_with_progress;

/// Where the model comes from. HuggingFace is unreachable from a lot of
/// networks (mainland China in particular), so the community mirror is used as a
/// fallback rather than failing the download outright.
const MODEL_DIR_NAME: &str = "nllb-200-distilled-600M";
const REPO_PATH: &str = "Xenova/nllb-200-distilled-600M";
const HOSTS: [&str; 2] = ["https://huggingface.co", "https://hf-mirror.com"];

const ENCODER_FILE: &str = "encoder_model_quantized.onnx";
/// First decoding pass (no cache).
const DECODER_FILE: &str = "decoder_model_quantized.onnx";
/// Every later pass (reads the cache produced by the first one).
const DECODER_PAST_FILE: &str = "decoder_with_past_model_quantized.onnx";
const TOKENIZER_FILE: &str = "tokenizer.json";
const CONFIG_FILE: &str = "config.json";

/// `(local file name, path inside the repository)`. The ONNX exports live in an
/// `onnx/` sub-folder upstream.
///
/// The *non-merged* decoder exports are used instead of
/// `decoder_model_merged_quantized.onnx`: the merged graph needs its two `If`
/// branches to be driven exactly right, and any mistake there makes it repeat a
/// single blank token forever (see `Engine::decode`).
const MODEL_FILES: [(&str, &str); 5] = [
    (CONFIG_FILE, "config.json"),
    (TOKENIZER_FILE, "tokenizer.json"),
    (ENCODER_FILE, "onnx/encoder_model_quantized.onnx"),
    (DECODER_FILE, "onnx/decoder_model_quantized.onnx"),
    (DECODER_PAST_FILE, "onnx/decoder_with_past_model_quantized.onnx"),
];
/// Sum of the five files, rounded up — shown before the download starts.
const DOWNLOAD_SIZE_MB: u32 = 1360;

/// NLLB was trained on ≤512 token sentences; the encoder has 1024 positions.
const MAX_SOURCE_TOKENS: usize = 480;
/// Hard cap on generated tokens. Real subtitle lines need a couple of dozen.
const MAX_NEW_TOKENS: usize = 256;
/// Lines translated per encoder/decoder pass. Batching turns the per-token
/// matmuls into much wider ones, which is where most of the speed comes from.
const BATCH_SIZE: usize = 8;

// ---------------------------------------------------------------------------
// Status + download
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NmtStatus {
    /// Every model file is on disk.
    pub installed: bool,
    /// Folder the model lives in.
    pub dir: String,
    pub download_size_mb: u32,
    /// The ONNX sessions are loaded and ready to translate.
    pub loaded: bool,
    /// Files that still have to be downloaded.
    pub missing: Vec<String>,
}

/// `<models folder>/translate/nllb-200-distilled-600M`.
pub fn model_dir(app: &AppHandle) -> Result<PathBuf> {
    let models_folder = crate::cmd::app::get_models_folder(app.clone()).context("cannot resolve the models folder")?;
    Ok(models_folder.join("translate").join(MODEL_DIR_NAME))
}

fn missing_files(dir: &Path) -> Vec<String> {
    MODEL_FILES
        .iter()
        .filter(|(name, _)| !dir.join(name).is_file())
        .map(|(name, _)| (*name).to_owned())
        .collect()
}

fn status_for(app: &AppHandle) -> NmtStatus {
    let (path, missing) = match model_dir(app) {
        Ok(dir) => (dir.clone(), missing_files(&dir)),
        Err(_) => (
            PathBuf::new(),
            MODEL_FILES.iter().map(|(name, _)| (*name).to_owned()).collect(),
        ),
    };
    NmtStatus {
        installed: missing.is_empty(),
        dir: path.to_string_lossy().to_string(),
        download_size_mb: DOWNLOAD_SIZE_MB,
        loaded: ENGINE.lock().map(|guard| guard.is_some()).unwrap_or(false),
        missing,
    }
}

#[tauri::command]
pub fn get_nmt_status(app: AppHandle) -> NmtStatus {
    status_for(&app)
}

/// Downloads every missing model file, one after the other. Progress is reported
/// through the shared `download_progress` event, so the UI shows the same toast
/// it uses for the other on-demand downloads.
#[tauri::command]
pub async fn install_nmt_model(app: AppHandle) -> Result<NmtStatus, String> {
    install(&app).await.map_err(|error| error.to_string())?;
    Ok(status_for(&app))
}

async fn install(app: &AppHandle) -> Result<()> {
    let dir = model_dir(app)?;
    std::fs::create_dir_all(&dir).with_context(|| format!("cannot create {}", dir.display()))?;

    for (name, remote) in MODEL_FILES {
        let destination = dir.join(name);
        if destination.is_file() {
            continue;
        }
        let mut last_error = None;
        let mut done = false;
        for host in HOSTS {
            let url = format!("{host}/{REPO_PATH}/resolve/main/{remote}");
            tracing::info!("downloading the translation model file {name} from {host}");
            match download_with_progress(app, &url, &destination).await {
                Ok(()) => {
                    done = true;
                    break;
                }
                Err(error) => {
                    tracing::warn!("download of {name} from {host} failed: {error:?}");
                    last_error = Some(error);
                }
            }
        }
        if !done {
            let error = last_error
                .map(|error| format!("{error:?}"))
                .unwrap_or_else(|| "no host available".to_owned());
            bail!("failed to download {name}: {error}");
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

/// UI language code → FLORES-200 code used by NLLB.
pub fn flores_code(code: &str) -> Option<&'static str> {
    Some(match code.trim().to_ascii_lowercase().replace('_', "-").as_str() {
        "zh" | "zh-cn" | "zh-hans" | "chinese" | "zho" => "zho_Hans",
        "zh-tw" | "zh-hant" => "zho_Hant",
        "en" | "en-us" | "english" | "eng" => "eng_Latn",
        "ja" | "ja-jp" | "japanese" | "jpn" => "jpn_Jpan",
        "ko" | "ko-kr" | "korean" | "kor" => "kor_Hang",
        "ru" | "russian" | "rus" => "rus_Cyrl",
        "fr" | "french" | "fra" => "fra_Latn",
        "de" | "german" | "deu" => "deu_Latn",
        "es" | "spanish" | "spa" => "spa_Latn",
        "it" | "italian" | "ita" => "ita_Latn",
        "pt" | "portuguese" | "por" => "por_Latn",
        "th" | "thai" | "tha" => "tha_Thai",
        "id" | "indonesian" | "ind" => "ind_Latn",
        "ar" | "arabic" | "ara" => "arb_Arab",
        "hi" | "hindi" | "hin" => "hin_Deva",
        _ => return None,
    })
}

/// Guesses the source language from the writing system, so "automatic" works
/// without shipping a language identification model.
pub fn detect_source(text: &str) -> &'static str {
    let mut kana = 0usize;
    let mut hangul = 0usize;
    let mut han = 0usize;
    let mut cyrillic = 0usize;
    let mut arabic = 0usize;
    let mut thai = 0usize;
    let mut devanagari = 0usize;
    let mut latin = 0usize;
    for ch in text.chars().take(4000) {
        match ch as u32 {
            0x3040..=0x30FF => kana += 1,
            0xAC00..=0xD7AF | 0x1100..=0x11FF => hangul += 1,
            0x4E00..=0x9FFF | 0x3400..=0x4DBF => han += 1,
            0x0400..=0x04FF => cyrillic += 1,
            0x0600..=0x06FF | 0x0750..=0x077F => arabic += 1,
            0x0E00..=0x0E7F => thai += 1,
            0x0900..=0x097F => devanagari += 1,
            0x0041..=0x024F => latin += 1,
            _ => {}
        }
    }
    // Kana is the only script that unambiguously points at Japanese; Korean text
    // often mixes in Han characters, so Hangul wins over Han as well.
    if kana > 0 {
        return "ja";
    }
    if hangul > 0 {
        return "ko";
    }
    if han > 0 {
        return "zh";
    }
    if cyrillic > 0 {
        return "ru";
    }
    if arabic > 0 {
        return "ar";
    }
    if thai > 0 {
        return "th";
    }
    if devanagari > 0 {
        return "hi";
    }
    if latin > 0 {
        return "en";
    }
    "en"
}

fn flores_or_detect(code: &str, sample: &str) -> Result<&'static str> {
    if code.is_empty() || code.eq_ignore_ascii_case("auto") {
        return Ok(detect_source(sample));
    }
    flores_code(code).with_context(|| format!("unsupported language: {code}"))
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/// Hyper-parameters needed for the decoding loop, read from the model's
/// `config.json` (NLLB: 12 decoder layers).
#[derive(Debug, Clone, Copy)]
struct ModelConfig {
    layers: usize,
    decoder_start: i64,
    eos: i64,
    pad: i64,
}

struct Engine {
    encoder: Session,
    decoder: Session,
    decoder_past: Session,
    tokenizer: Tokenizer,
    cfg: ModelConfig,
}

/// The loaded engine is kept for the lifetime of the process: reading ~900 MB of
/// weights takes a few seconds and would otherwise be paid on every translation.
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

#[derive(Default)]
pub struct NmtState {
    /// Set by `cancel_nmt` and checked between decoding steps.
    pub cancel: AtomicBool,
}

fn build_session(path: &Path) -> Result<Session> {
    let threads = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .clamp(1, 8);
    let builder = Session::builder().map_err(|error| eyre::eyre!("cannot create the ONNX Runtime session builder: {error}"))?;
    builder
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|error| eyre::eyre!("cannot set the graph optimization level: {error}"))?
        .with_intra_threads(threads)
        .map_err(|error| eyre::eyre!("cannot set the ONNX Runtime thread count: {error}"))?
        .commit_from_file(path)
        .with_context(|| format!("cannot load the ONNX model {}", path.display()))
}

fn read_config(dir: &Path) -> Result<ModelConfig> {
    let text = std::fs::read_to_string(dir.join(CONFIG_FILE)).with_context(|| format!("cannot read {CONFIG_FILE}"))?;
    let json: serde_json::Value = serde_json::from_str(&text).context("invalid config.json")?;
    let number = |key: &str, fallback: i64| json.get(key).and_then(|value| value.as_i64()).unwrap_or(fallback);
    Ok(ModelConfig {
        layers: number("decoder_layers", 12).clamp(1, 64) as usize,
        decoder_start: number("decoder_start_token_id", 2),
        eos: number("eos_token_id", 2),
        pad: number("pad_token_id", 1),
    })
}

fn load_engine(dir: &Path) -> Result<Engine> {
    let started = Instant::now();
    let cfg = read_config(dir)?;
    let tokenizer =
        Tokenizer::from_file(dir.join(TOKENIZER_FILE)).map_err(|error| eyre::eyre!("cannot load {TOKENIZER_FILE}: {error}"))?;
    let encoder = build_session(&dir.join(ENCODER_FILE))?;
    let decoder = build_session(&dir.join(DECODER_FILE))?;
    let decoder_past = build_session(&dir.join(DECODER_PAST_FILE))?;
    tracing::info!("translation engine loaded in {:?}", started.elapsed());
    Ok(Engine {
        encoder,
        decoder,
        decoder_past,
        tokenizer,
        cfg,
    })
}

fn i64_tensor(shape: Vec<i64>, data: Vec<i64>) -> Result<Tensor<i64>> {
    Tensor::from_array((shape, data)).map_err(|error| eyre::eyre!("cannot build an input tensor: {error}"))
}

/// Token ids of one line, truncated to what the encoder can hold.
///
/// The exported `tokenizer.json` hard-codes `eng_Latn` as the source-language
/// prefix (it was exported for en→X), so the prefix is built here instead:
/// `[src_lang, ...tokens..., </s>]`, exactly like the Python `NllbTokenizer`
/// does once `src_lang` is set.
fn encode_line(tokenizer: &Tokenizer, text: &str, source_token: i64, eos: i64) -> Result<Vec<i64>> {
    let encoding = tokenizer
        .encode(text, false)
        .map_err(|error| eyre::eyre!("cannot tokenize the source text: {error}"))?;
    let mut ids: Vec<i64> = Vec::with_capacity(encoding.len() + 2);
    ids.push(source_token);
    ids.extend(encoding.get_ids().iter().map(|id| *id as i64));
    ids.push(eos);
    if ids.len() > MAX_SOURCE_TOKENS + 2 {
        ids.truncate(MAX_SOURCE_TOKENS + 1);
        ids.push(eos);
    }
    Ok(ids)
}

impl Engine {
    /// Id of a FLORES-200 language token (`zho_Hans`, `jpn_Jpan`, …).
    fn token_id(&self, flores: &str) -> Result<i64> {
        self.tokenizer
            .token_to_id(flores)
            .map(|id| id as i64)
            .with_context(|| format!("the model has no token for {flores}"))
    }

    /// Runs the encoder over a padded batch and returns (hidden states, mask, length).
    fn encode(&mut self, batch: &[Vec<i64>]) -> Result<(DynValue, Vec<i64>, usize)> {
        let rows = batch.len();
        let length = batch.iter().map(|ids| ids.len()).max().unwrap_or(1).max(1);
        let mut ids = vec![self.cfg.pad; rows * length];
        let mut mask = vec![0i64; rows * length];
        for (row, line) in batch.iter().enumerate() {
            for (column, id) in line.iter().enumerate() {
                ids[row * length + column] = *id;
                mask[row * length + column] = 1;
            }
        }
        let shape = vec![rows as i64, length as i64];
        let outputs = self
            .encoder
            .run(ort::inputs![
                "input_ids" => i64_tensor(shape.clone(), ids)?,
                "attention_mask" => i64_tensor(shape, mask.clone())?,
            ])
            .context("the translation encoder failed")?;
        let hidden = outputs
            .into_iter()
            .find_map(|(name, value)| (name == "last_hidden_state").then_some(value))
            .context("the encoder did not return last_hidden_state")?;
        Ok((hidden, mask, length))
    }

    /// Greedy-decodes a batch and returns the token ids of every row.
    ///
    /// Two decoder graphs are used, exactly as the model repository ships them:
    /// `decoder_model` runs the first pass (cross-attention keys and values are
    /// computed from `encoder_hidden_states`) and hands the cache back as
    /// `present.*`; `decoder_with_past_model` then consumes that cache one token at
    /// a time. Their contracts are printed by `dump_model_io`.
    ///
    /// The alternative `decoder_model_merged` export is deliberately not used: its
    /// single `If` node has to be driven with `use_cache_branch` *inverted* and a
    /// zero-length placeholder cache, and getting that detail wrong makes the
    /// decoder repeat one blank token forever instead of translating.
    fn decode(
        &mut self,
        hidden: &DynValue,
        mask: &[i64],
        length: usize,
        rows: usize,
        target_token: i64,
        cancel: &AtomicBool,
    ) -> Result<Vec<Vec<i64>>> {
        let layers = self.cfg.layers;
        let mut names: Vec<(String, String, String, String)> = Vec::with_capacity(layers);
        for layer in 0..layers {
            names.push((
                format!("past_key_values.{layer}.decoder.key"),
                format!("past_key_values.{layer}.decoder.value"),
                format!("past_key_values.{layer}.encoder.key"),
                format!("past_key_values.{layer}.encoder.value"),
            ));
        }

        // NLLB is steered by a target-language token, which the reference
        // implementation forces as the very first decoded token; feeding it in
        // directly saves a decoding step.
        let mut step_input: Vec<i64> = Vec::with_capacity(rows * 2);
        for _ in 0..rows {
            step_input.push(self.cfg.decoder_start);
            step_input.push(target_token);
        }
        let mut prompt_len = 2usize;

        let mut cache: HashMap<String, DynValue> = HashMap::new();
        let mut generated: Vec<Vec<i64>> = vec![Vec::new(); rows];
        let mut finished = vec![false; rows];

        for _ in 0..MAX_NEW_TOKENS {
            if cancel.load(Ordering::Relaxed) {
                bail!("cancelled");
            }
            let first = cache.is_empty();

            let outputs = if first {
                let feeds = ort::inputs![
                    "input_ids" => i64_tensor(vec![rows as i64, prompt_len as i64], step_input.clone())?,
                    "encoder_attention_mask" => i64_tensor(vec![rows as i64, length as i64], mask.to_vec())?,
                    "encoder_hidden_states" => hidden,
                ];
                self.decoder.run(feeds).context("the translation decoder failed")?
            } else {
                let mut feeds = ort::inputs![
                    "input_ids" => i64_tensor(vec![rows as i64, 1], step_input.clone())?,
                    "encoder_attention_mask" => i64_tensor(vec![rows as i64, length as i64], mask.to_vec())?,
                ];
                for (decoder_key, decoder_value, encoder_key, encoder_value) in &names {
                    for name in [decoder_key, decoder_value, encoder_key, encoder_value] {
                        let value = cache
                            .get(name)
                            .with_context(|| format!("the translation cache is missing {name}"))?;
                        feeds.push((name.clone().into(), value.into()));
                    }
                }
                self.decoder_past.run(feeds).context("the translation decoder failed")?
            };

            let mut next_cache: HashMap<String, DynValue> = HashMap::with_capacity(names.len() * 4);
            // The "with past" graph only re-emits the *self*-attention cache. The
            // cross-attention keys/values never change once the first pass computed
            // them, so they are carried over instead of being read back every step.
            for (key, value) in cache.drain() {
                if key.contains(".encoder.") {
                    next_cache.insert(key, value);
                }
            }
            let mut next_input: Vec<i64> = Vec::with_capacity(rows);
            let mut saw_logits = false;
            for (name, value) in outputs {
                if let Some(rest) = name.strip_prefix("present.") {
                    next_cache.insert(format!("past_key_values.{rest}"), value);
                    continue;
                }
                if name != "logits" {
                    continue;
                }
                saw_logits = true;
                let (shape, data) = value
                    .try_extract_tensor::<f32>()
                    .map_err(|error| eyre::eyre!("cannot read the decoder logits: {error}"))?;
                let dims: Vec<usize> = shape.iter().map(|dim| *dim as usize).collect();
                let (rows_out, positions, vocab) = match dims.as_slice() {
                    [batch, positions, vocab] => (*batch, *positions, *vocab),
                    _ => bail!("unexpected logits shape {dims:?}"),
                };
                let last = positions.saturating_sub(1);
                for row in 0..rows_out.min(rows) {
                    let offset = (row * positions + last) * vocab;
                    let slice = &data[offset..offset + vocab];
                    let mut best = 0usize;
                    let mut best_score = f32::NEG_INFINITY;
                    for (index, score) in slice.iter().enumerate() {
                        if *score > best_score {
                            best_score = *score;
                            best = index;
                        }
                    }
                    let token = best as i64;
                    if finished[row] || token == self.cfg.eos {
                        finished[row] = true;
                        next_input.push(self.cfg.pad);
                        continue;
                    }
                    generated[row].push(token);
                    next_input.push(token);
                }
            }
            if !saw_logits {
                bail!("the decoder did not return logits");
            }
            if finished.iter().all(|done| *done) {
                break;
            }
            cache = next_cache;
            step_input = next_input;
            prompt_len = 1;
        }

        Ok(generated)
    }

    fn translate(
        &mut self,
        lines: &[String],
        source: &str,
        target: &str,
        cancel: &AtomicBool,
        mut on_progress: impl FnMut(usize, usize),
    ) -> Result<Vec<String>> {
        let source_token = self.token_id(source)?;
        let target_token = self.token_id(target)?;
        let eos = self.cfg.eos;

        let mut result: Vec<String> = vec![String::new(); lines.len()];
        let mut done = 0usize;
        for (chunk_index, chunk) in lines.chunks(BATCH_SIZE).enumerate() {
            let base = chunk_index * BATCH_SIZE;
            // Blank lines are copied over unchanged so subtitles keep their shape.
            let pending: Vec<(usize, &String)> = chunk
                .iter()
                .enumerate()
                .filter(|(_, line)| !line.trim().is_empty())
                .map(|(index, line)| (base + index, line))
                .collect();
            if pending.is_empty() {
                done += chunk.len();
                on_progress(done, lines.len());
                continue;
            }

            let batch: Vec<Vec<i64>> = pending
                .iter()
                .map(|(_, line)| encode_line(&self.tokenizer, line, source_token, eos))
                .collect::<Result<_>>()?;
            let rows = batch.len();
            let (hidden, mask, length) = self.encode(&batch)?;
            let decoded = self.decode(&hidden, &mask, length, rows, target_token, cancel)?;
            for ((index, original), ids) in pending.iter().zip(decoded) {
                let text = self
                    .tokenizer
                    .decode(&ids.iter().map(|id| *id as u32).collect::<Vec<u32>>(), true)
                    .unwrap_or_default();
                let text = text.trim().to_owned();
                result[*index] = if text.is_empty() { (*original).clone() } else { text };
            }
            done += chunk.len();
            on_progress(done, lines.len());
        }
        Ok(result)
    }
}

/// Translates `lines`, keeping the line count so subtitle timings stay valid.
///
/// Empty lines are passed through untouched, and a line the model cannot
/// translate falls back to its original text instead of disappearing.
pub fn translate_lines(
    dir: &Path,
    lines: &[String],
    source: &str,
    target: &str,
    cancel: &AtomicBool,
    mut on_progress: impl FnMut(usize, usize),
) -> Result<Vec<String>> {
    let sample = lines.iter().find(|line| !line.trim().is_empty()).cloned().unwrap_or_default();
    let source = flores_or_detect(source, &sample)?;
    let target = flores_code(target).with_context(|| format!("unsupported target language: {target}"))?;

    let mut guard = ENGINE
        .lock()
        .map_err(|_| eyre::eyre!("the translation engine is unavailable"))?;
    if guard.is_none() {
        *guard = Some(load_engine(dir)?);
    }
    let engine = guard.as_mut().expect("engine was just loaded");
    engine.translate(lines, source, target, cancel, &mut on_progress)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Translates a list of lines and reports progress through `nmt_progress`.
///
/// Runs on a blocking thread: a subtitle file keeps the CPU busy for a while and
/// the window must stay responsive (its frame is drawn by the webview).
#[tauri::command]
pub async fn nmt_translate(app: AppHandle, lines: Vec<String>, source: String, target: String) -> Result<Vec<String>, String> {
    translate_command(app, lines, source, target)
        .await
        .map_err(|error| error.to_string())
}

async fn translate_command(app: AppHandle, lines: Vec<String>, source: String, target: String) -> Result<Vec<String>> {
    let dir = model_dir(&app)?;
    if !missing_files(&dir).is_empty() {
        bail!("the translation model is not downloaded yet");
    }
    reset_cancel(&app.state::<NmtState>());
    let total = lines.len();
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let state = handle.state::<NmtState>();
        let emitter = handle.clone();
        let outcome = translate_lines(&dir, &lines, &source, &target, &state.cancel, |done, total| {
            let _ = emitter.emit("nmt_progress", serde_json::json!({ "done": done, "total": total }));
        });
        let _ = handle.emit("nmt_progress", serde_json::json!({ "done": total, "total": total }));
        outcome
    })
    .await
    .context("the translation task panicked")?;
    result
}

#[tauri::command]
pub fn cancel_nmt(state: tauri::State<'_, NmtState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Clears the cancel flag before a new run (called by `translate_command`).
pub fn reset_cancel(state: &NmtState) {
    state.cancel.store(false, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_writing_systems() {
        assert_eq!(detect_source("こんにちは、世界。"), "ja");
        assert_eq!(detect_source("안녕하세요"), "ko");
        assert_eq!(detect_source("你好，世界"), "zh");
        assert_eq!(detect_source("Привет мир"), "ru");
        assert_eq!(detect_source("Hello world"), "en");
    }

    #[test]
    fn maps_ui_languages_to_flores() {
        assert_eq!(flores_code("zh").unwrap(), "zho_Hans");
        assert_eq!(flores_code("JA").unwrap(), "jpn_Jpan");
        assert!(flores_code("klingon").is_none());
    }

    /// Prints the ONNX contract of both graphs plus a sample tokenization. Handy
    /// when a new export changes names, shapes or the cache layout:
    /// `cargo test --manifest-path desktop/src-tauri/Cargo.toml nmt::tests::dump_model_io -- --ignored --nocapture`
    #[test]
    #[ignore = "diagnostic: needs the downloaded NLLB model"]
    fn dump_model_io() {
        let dir = std::env::var("NMT_MODEL_DIR").expect("set NMT_MODEL_DIR to the model folder");
        let tokenizer = Tokenizer::from_file(Path::new(&dir).join(TOKENIZER_FILE)).expect("tokenizer");
        for code in ["eng_Latn", "zho_Hans", "jpn_Jpan", "</s>", "<s>", "<pad>"] {
            println!("token {code:>10} -> id {:?}", tokenizer.token_to_id(code));
        }
        let encoding = tokenizer.encode("Hello world, this is a test.", false).expect("encode");
        println!("encode ids {:?}", encoding.get_ids());
        let candidates = [
            ("encoder", ENCODER_FILE),
            ("decoder-first", DECODER_FILE),
            ("decoder-past", DECODER_PAST_FILE),
        ];
        for (label, file) in candidates {
            let path = Path::new(&dir).join(file);
            if !path.is_file() {
                println!("=== {label} · {file} (missing)");
                continue;
            }
            let session = build_session(&path).expect("failed to load the model");
            println!("=== {label} · {file}");
            for input in session.inputs() {
                println!("  in   {:<44} {:?}", input.name(), input.dtype());
            }
            for output in session.outputs() {
                println!("  out  {:<44} {:?}", output.name(), output.dtype());
            }
        }
    }

    /// Real end-to-end check; needs the model in the app's models folder:
    /// `cargo test --manifest-path desktop/src-tauri/Cargo.toml nmt:: -- --ignored --nocapture`
    #[test]
    #[ignore = "requires the downloaded NLLB model"]
    fn translates_a_sentence() {
        let dir = std::env::var("NMT_MODEL_DIR").expect("set NMT_MODEL_DIR to the model folder");
        let lines = vec![
            "Hello world, this is a test of the translation engine.".to_owned(),
            "こんにちは、世界。".to_owned(),
            "Good morning, everyone.".to_owned(),
        ];
        let cancel = AtomicBool::new(false);
        let started = Instant::now();
        let output = translate_lines(Path::new(&dir), &lines, "auto", "zh", &cancel, |done, total| {
            println!("progress {done}/{total}");
        })
        .expect("translation failed");
        println!("elapsed {:?}", started.elapsed());
        for (source, translated) in lines.iter().zip(output.iter()) {
            println!("{source}\n  -> {translated}");
        }
        assert!(output.iter().all(|line| !line.trim().is_empty()));
        assert_ne!(output[0], lines[0], "the first line should have been translated");
    }
}
