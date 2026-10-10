# ShiorikoTrans Architecture

## Overview

ShiorikoTrans is a desktop transcription app built with **Tauri** (Rust + TypeScript frontend).

## Components

### Desktop App (`desktop/`)

- **Frontend**: TypeScript + React (UI)
- **Backend**: Rust/Tauri (`desktop/src-tauri/`)
- Handles UI, file management, settings, analytics
- Spawns and communicates with the Sona runner via local HTTP

### Sona Runner (`sona/` folder)

- **Language**: Rust + whisper.cpp bindings
- **Location**: Separate repository at `github.com/thewh1teagle/sona` (also cloned locally in `./sona`)
- **Purpose**: Single local runner process for audio transcription, model loading, streaming, and diarization
- Bundled as one `sona` binary sidecar with the desktop app
- Diarization is in-process in Sona via `diarize-rs`; ShiorikoTrans does not bundle or spawn a separate `sona-diarize` binary
- **Build**: Separate CI/CD in sona repository
- **Distribution**: Pre-built Sona binaries downloaded during ShiorikoTrans build (see `scripts/pre_build.py`)

### FFmpeg Helper

- The **full** Windows / macOS build bundles `ffmpeg` from the Sona release archives (~97 MB, the largest file in the package)
- The **slim** Windows build (`tauri.slim.conf.json`, `pnpm build:windows:slim`) leaves it out and downloads the public single-file static build from `eugeneware/ffmpeg-static` on demand into `<app data>/bin/`
- `ffmpeg.rs` resolves the binary from: downloaded copy → bundled next to the exe / in resources → `PATH`
- ShiorikoTrans passes its path to Sona with `SONA_FFMPEG_PATH` (the sidecar is restarted after a fresh download so it picks the path up)

### Build Flow

1. ShiorikoTrans CI runs `scripts/pre_build.py`
2. Script downloads pre-built Sona binaries from Sona releases
3. Binaries placed in `desktop/src-tauri/binaries/`
4. Tauri bundles `sona` and, where configured, `ffmpeg` into the final app

## Key Point for Agents

Native runtime compatibility issues for transcription usually come from the Sona runner or its linked whisper/ggml libraries, not the ShiorikoTrans UI code.

To fix Sona runtime compatibility issues, update **Sona's** build configuration in the Sona repository, then bump `.sona-version` in ShiorikoTrans.

## Performance & concurrency

Sona's HTTP server holds an **exclusive lease** on its loaded model (a second
concurrent request is answered with `429 busy`), and the sidecar binary comes
from the Sona repository. Parallel transcription is therefore implemented
entirely on the desktop side, by running several sidecar processes.

### Worker pool (`desktop/src-tauri/src/sona/pool.rs`)

- `SonaPool` owns 1..`hardware::MAX_WORKERS` `sona` processes. The first one is
  the **primary** worker: the local API server, the model metadata endpoint and
  the single-file transcription all keep using it.
- Extra workers are created **lazily**, only when every worker is busy and the
  pool has not reached its limit, and are reused for later files.
- A GPU load failure marks the pool `degraded` and collapses it to one worker
  (running several CPU-bound processes would only oversubscribe the machine).
- Every worker PID is registered in `sona::process_pids()` so app exit can kill
  all of them synchronously.

### Hardware detection (`desktop/src-tauri/src/hardware.rs`)

`get_hardware_info` reports CPU cores, RAM and GPUs (from `sona devices`,
enriched with VRAM via `nvidia-smi`, then Windows DXGI, then Apple unified
memory), and derives a `PerfProfile`:

- workers = how many model instances fit in VRAM (model size + per-process
  working buffers), capped by RAM and `MAX_WORKERS`;
- threads = physical cores clamped to 4..=16 — used when a request does not send
  `n_threads`, instead of the old hardcoded 4;
- CPU-only, low VRAM, unknown VRAM and **integrated GPUs** all fall back to
  `workers = 1`. The integrated case is measured, not assumed: on a shared-memory
  iGPU a second process ran at roughly half the throughput of one, and splitting
  a single file across two processes measured 0.56x.

### Chunked single-file transcription (`desktop/src-tauri/src/chunked.rs`)

Opt-in (`allow_chunking`, Whisper-family models, no diarization, longer than
`MIN_TOTAL_SECONDS`): the file is cut at **detected silences** (ffmpeg
`silencedetect`, snapped within ±20% of each ideal boundary, even split as
fallback) into 16 kHz mono PCM WAV chunks — the format sona reads natively, with
no extra conversion — transcribed concurrently and merged with their time
offsets. Segment timestamps are centiseconds.

It is off by default because the wall-clock win is hardware dependent (0.56x on
the iGPU above) and the wording right after a cut can differ from a single-pass
transcript; on a fast discrete GPU it turns a long file into several parallel
chunks instead.

### Progress routing

`transcribe_progress` and `new_segment` payloads carry a `jobId`. The home page
runs the untagged (`null`) job; the batch page tags each file with
`batch-<index>` so concurrent rows update independently. The window/taskbar
progress indicator shows the mean of all in-flight jobs.
