# Plan: Hunyuan-Audio (腾讯混元音频) integration

## Goal

Add Tencent **Hunyuan-Audio** (腾讯混元音频) — an ASR + audio-understanding model —
to Audire/sona. This plan covers (1) what has been scaffolded already, (2) how to
obtain the model, and (3) the design for a dedicated Rust inference engine.

**Status: 兼容识别 + 下载入口已就绪；推理引擎尚未实现（本计划为其设计）。**

## 1. Model background

- **Model**: `tencent/Hunyuan-Audio` (HuggingFace)
- **Type**: multi-turn audio understanding + speech recognition (zh/en)
- **Architecture** (custom, not whisper/nemotron/sensevoice):
  - Audio encoder: Whisper-large-v3 (encoder only)
  - Adapter: linear projection (audio-encoder-adapter)
  - LLM backbone: Qwen2-7B
  - Tokenizer: Qwen2 tokenizer (HF `tokenizers`)
- **Format**: multi-file safetensors (`model.safetensors` etc.), ~14 GB total
- **Download**: **gated** — requires HuggingFace login + accepting the model
  license (HTTP 401 without auth token)

## 2. What is already in place (this change)

| Area | File | Change |
|---|---|---|
| Frontend model type | `desktop/src/lib/model-pipeline.ts` | new `hunyuan` ModelType + keywords (`hunyuan`/`混元`) + capabilities |
| Frontend download entry | `desktop/src/lib/config.ts` | `hunyuanModelFilename` / `hunyuanModelUrl` (+ gated/multi-file notes) |
| sona engine recognition | `sona/crates/sona/src/engine.rs` | `is_hunyuan_model()` + clear "engine not implemented" error in `Engine::load` + `hunyuan_capabilities()` |
| sona metadata | `sona/crates/sona/src/server/routes/models.rs` | `/v1/models/metadata` returns `hunyuan` capabilities |

Behavior: the app now recognizes Hunyuan-Audio files (labels as "hunyuan" engine,
shows correct capabilities). Loading a Hunyuan model in sona returns a clear
"requires a dedicated inference engine (not implemented yet)" error instead of a
cryptic whisper-load failure.

## 3. Downloading the model (manual, needs HF token)

The official repo is gated. Use your HF token (run yourself — do not put tokens
in code or chat):

```bash
# 1. Accept the model license on https://huggingface.co/tencent/Hunyuan-Audio
# 2. Then (replace <HF_TOKEN> with your own token, and the target dir):
export HF_TOKEN=<your-token>
mkdir -p <models>/hunyuan-audio
cd <models>/hunyuan-audio
# Multi-file download (config, weights, tokenizer, audio encoder)
for f in config.json generation_config.json model.safetensors \
         audio_encoder/config.json audio_encoder/encoder.safetensors \
         tokenizer.json tokenizer_config.json special_tokens_map.json \
         adapter/down_proj.safetensors; do
  curl -L -H "Authorization: Bearer $HF_TOKEN" \
    -O "https://huggingface.co/tencent/Hunyuan-Audio/resolve/main/$f"
done
```

Exact file list must be confirmed from the repo once access is granted (the
adapter weights and encoder layout are repo-specific).

## 4. Inference engine design (not yet implemented)

### 4.1 Approach options

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A. `candle` (Rust) custom engine** | Pure Rust, loads safetensors directly, Qwen2 support exists; fits sona single-binary model | 7B LLM decode in pure Rust is non-trivial; perf tuning needed | **Recommended** |
| B. C++ runtime via FFI (e.g. a Qwen2 C++ impl) | Faster inference reuse | New C++ dep + build complexity | Fallback |
| C. ONNX export + `ort` (DirectML) | Reuses existing onnxruntime path | 7B ONNX LLM is slow/awkward; export hard | Not preferred |
| D. llama.cpp | Great GGUF infra | Hunyuan-Audio is **not** supported by llama.cpp | Out |

### 4.2 Pipeline (engine `hunyuan-rs`)

```
audio (16k mono, already decoded by sona)
  → mel features (port from Hunyuan-Audio repo / whisper.cpp mels)
  → Whisper-large-v3 encoder   (bind to vendored whisper.cpp encoder, no decoder)
  → audio-encoder adapter      (linear proj → LLM hidden size)
  → prompt assembly (special tokens + audio tokens + task prefix, e.g. <|ASR|>)
  → Qwen2-7B decode (greedy / beam)  → text
  → timestamps from VAD / alignment (reuse vad-rs chunks, like stable timestamps)
  → TranscribeResult { segments }
```

Reuse from sona already present:
- `whisper.cpp` (vendored, `whisper-cpp-sys`) — mel + encoder
- `vad-rs` — speech chunking for per-chunk decode + timestamps
- `tokenizers`-style tokenizer loading (new dep)

### 4.3 Integration into sona

1. New crate `sona/crates/hunyuan-rs` (engine: load + transcribe).
2. `Engine` enum adds `Hunyuan(Box<hunyuan_rs::Model>)`.
3. `Engine::load` routes Hunyuan files to the new engine (replacing the current
   bail), `Engine::transcribe` / `transcribe_stream` implement the pipeline.
4. Capabilities already defined (`hunyuan_capabilities()`); frontend already
   detects the model type.
5. Streaming: per-VAD-chunk decode + `on_segment`/`on_progress` (mirror
   `stable.rs`).

### 4.4 Performance & constraints

- ~14 GB weights; GPU needed for 7B decode (Vulkan via ggml, or CPU with Q4
  quantization). Expect RAM/VRAM 12–16 GB minimum.
- Gated license — confirm redistribution terms before bundling.
- Language: zh/en native; timestamps need VAD alignment (same approach as
  stable timestamps).

## 5. Phases

1. **Scaffolding** (done): frontend type/detection/download entry; sona
   recognition + clear error; this plan.
2. **Model acquisition**: user downloads gated model (see §3), place under
   `models/hunyuan-audio/`.
3. **Engine PoC**: `hunyuan-rs` — load safetensors + run a short audio → text
   (candle Qwen2 + whisper encoder), validate ASR quality.
4. **Full integration**: sona `Engine` wiring, VAD chunking, streaming, SRT.
5. **Packaging**: model download UI button, docs, perf tuning.

## 6. Validation

- `cargo run -p hunyuan-rs --example transcribe -- <model-dir> <16k-mono.wav>`
  (mirror `whisper-rs` example).
- Compare ASR on `samples/*.wav` (zh/en) against SenseVoice/whisper.
- End-to-end via sona `/v1/audio/transcriptions` with `stream=true`.
