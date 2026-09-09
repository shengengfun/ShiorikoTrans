use crate::setup::SonaState;
use eyre::{bail, Context, ContextCompat, Result};
use std::io::Read;
use std::path::PathBuf;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;

pub fn resolve_sona_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    // Try to find sona binary in the app's resource directory (sidecar)
    let resource_dir = app_handle.path().resource_dir().context("get resource dir")?;
    tracing::debug!("resource_dir: {}", resource_dir.display());

    #[cfg(target_os = "windows")]
    let binary_name = "sona.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "sona";

    // Tauri externalBin may keep the target-triple suffix
    let target_triple = std::env::consts::ARCH;
    #[cfg(target_os = "windows")]
    let triple_name = format!("sona-{}-pc-windows-msvc.exe", target_triple);
    #[cfg(target_os = "macos")]
    let triple_name = format!("sona-{}-apple-darwin", target_triple);
    #[cfg(target_os = "linux")]
    let triple_name = format!("sona-{}-unknown-linux-gnu", target_triple);

    // Candidate paths in priority order
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Workspace-side binaries for local development builds.
    // CARGO_MANIFEST_DIR points to desktop/src-tauri at compile time.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_binaries_dir = manifest_dir.join("binaries");
    candidates.push(repo_binaries_dir.join(binary_name));
    candidates.push(repo_binaries_dir.join(&triple_name));

    // 2. resource_dir/sona.exe (Tauri renames during bundling)
    candidates.push(resource_dir.join(binary_name));
    // 3. resource_dir/sona-x86_64-pc-windows-msvc.exe (target-triple suffix)
    candidates.push(resource_dir.join(&triple_name));

    // 4. exe_dir/sona.exe
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join(binary_name));
            candidates.push(exe_dir.join(&triple_name));
        }
    }

    // 5. Common Linux install paths
    #[cfg(target_os = "linux")]
    {
        let linux_paths = [
            PathBuf::from("/usr/lib/shiorikotrans").join(binary_name),
            PathBuf::from("/usr/lib/shiorikotrans/binaries").join(binary_name),
            PathBuf::from("/opt/shiorikotrans").join(binary_name),
            PathBuf::from("/opt/shiorikotrans/binaries").join(binary_name),
        ];
        for path in &linux_paths {
            candidates.push(path.clone());
        }
    }

    // 6. Fallback: check PATH
    if let Ok(path) = which::which(binary_name) {
        candidates.push(path);
    }

    // Try each candidate, validating it's a real executable
    for candidate in &candidates {
        if !candidate.exists() {
            continue;
        }
        tracing::debug!("checking sona candidate: {}", candidate.display());

        // Validate the file is a real executable, not a 0-byte or corrupted file
        match validate_executable(candidate) {
            Ok(()) => {
                tracing::info!("resolved sona binary: {}", candidate.display());
                return Ok(candidate.clone());
            }
            Err(e) => {
                tracing::warn!("sona candidate invalid {}: {}", candidate.display(), e);
            }
        }
    }

    // Log all candidates for debugging
    for (i, c) in candidates.iter().enumerate() {
        let exists = c.exists();
        let size = if exists {
            std::fs::metadata(c).map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };
        tracing::error!("candidate[{}]: {} (exists={}, size={})", i, c.display(), exists, size);
    }

    bail!("sona binary not found or invalid in any candidate path")
}

fn validate_executable(path: &std::path::Path) -> Result<()> {
    let metadata = std::fs::metadata(path).context("failed to read file metadata")?;
    if metadata.len() < 1024 {
        bail!("file too small ({} bytes), not a valid executable", metadata.len());
    }

    #[cfg(target_os = "windows")]
    {
        use std::io::Read;
        let mut file = std::fs::File::open(path).context("failed to open file")?;
        let mut header = [0u8; 2];
        file.read_exact(&mut header).context("failed to read header")?;
        // Check for MZ header (Windows PE executable)
        if &header != b"MZ" {
            bail!("file does not have MZ header, not a valid Windows executable");
        }
    }

    #[cfg(target_os = "linux")]
    {
        use std::io::Read;
        let mut file = std::fs::File::open(path).context("failed to open file")?;
        let mut header = [0u8; 4];
        file.read_exact(&mut header).context("failed to read header")?;
        // Check for ELF header
        if &header != b"\x7fELF" {
            bail!("file does not have ELF header, not a valid Linux executable");
        }
    }

    #[cfg(target_os = "macos")]
    {
        use std::io::Read;
        let mut file = std::fs::File::open(path).context("failed to open file")?;
        let mut header = [0u8; 4];
        file.read_exact(&mut header).context("failed to read header")?;
        // Check for Mach-O header (both 32-bit and 64-bit magic)
        let magic = u32::from_le_bytes(header);
        if magic != 0xFEEDFACE && magic != 0xFEEDFACF && magic != 0xBEBAFECA {
            bail!("file does not have Mach-O header, not a valid macOS executable");
        }
    }

    Ok(())
}

pub fn resolve_ffmpeg_path(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let resource_dir = app_handle.path().resource_dir().ok()?;

    #[cfg(target_os = "windows")]
    let binary_name = "ffmpeg.exe";
    #[cfg(not(target_os = "windows"))]
    let binary_name = "ffmpeg";

    let sidecar_path = resource_dir.join(binary_name);
    if sidecar_path.exists() {
        return Some(sidecar_path);
    }

    None
}

fn validate_model_file(path: &str) -> Result<u64> {
    let path_buf = std::path::PathBuf::from(path);
    if !path_buf.exists() {
        bail!("model file not found: {path}");
    }
    let metadata = std::fs::metadata(&path_buf).context("failed to read model file metadata")?;
    let size = metadata.len();
    tracing::debug!("model file size: {} bytes ({:.2} GB)", size, size as f64 / 1_073_741_824.0);

    let extension = path_buf.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if extension == "gguf" || extension == "bin" {
        let mut file = std::fs::File::open(&path_buf).context("failed to open model file")?;
        let mut magic = [0u8; 4];
        file.read_exact(&mut magic).context("failed to read model file header")?;
        // GGUF magic: 0x46554747 stored little-endian => bytes "GGUF" in file.
        // ggml magic: 0x67676d6c stored little-endian => bytes "lmgg" in file.
        // (Older whisper.cpp models use the ggml format with .bin extension.)
        let magic_le = u32::from_le_bytes(magic);
        const GGUF_MAGIC: u32 = 0x46554747;
        const GGML_MAGIC: u32 = 0x67676d6c;
        if magic_le != GGUF_MAGIC && magic_le != GGML_MAGIC {
            bail!(
                "model file does not have valid GGUF or ggml magic bytes (expected GGUF=0x46554747 or ggml=0x67676d6c, got 0x{:08X} / {:?})",
                magic_le,
                std::str::from_utf8(&magic).unwrap_or("<invalid>")
            );
        }
    } else if extension == "onnx" {
        let mut file = std::fs::File::open(&path_buf).context("failed to open model file")?;
        let mut magic = [0u8; 4];
        file.read_exact(&mut magic).context("failed to read model file header")?;
        if &magic != b"\x80\x89\x50\x4E" {
            tracing::warn!(
                "ONNX model file does not have valid magic bytes (expected ONNX, got {:?})",
                std::str::from_utf8(&magic).unwrap_or("<invalid>")
            );
        }
    } else if extension == "pt" || extension == "pth" {
        let mut file = std::fs::File::open(&path_buf).context("failed to open model file")?;
        let mut magic = [0u8; 2];
        file.read_exact(&mut magic).context("failed to read model file header")?;
        if magic != [0x80, 0x02] && magic != [0x80, 0x03] && magic != [0x80, 0x04] {
            tracing::warn!(
                "PyTorch model file does not have valid magic bytes (expected pickle, got {:?})",
                magic
            );
        }
    }

    Ok(size)
}

fn is_f16_model(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.contains("f16") || lower.contains("float16")
}

/// Returns a user-facing explanation when a model file can never be loaded by
/// the built-in engine (sona).
///
/// sona supports Whisper (GGML/GGUF), Nemotron/Parakeet (GGUF) and SenseVoice
/// (ONNX). Any *other* ONNX model is silently fed to the whisper loader and
/// fails with a confusing `invalid model data (bad magic)` error, so we
/// intercept non-SenseVoice ONNX files up front. SenseVoice models are
/// identified by filename (mirrors the frontend `detectModelType`) and allowed
/// through — sona does the authoritative metadata-based detection on load.
fn unsupported_model_hint(model_path: &str) -> Option<String> {
    let lower = model_path.to_lowercase();
    let extension = std::path::Path::new(model_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    let looks_like_sensevoice =
        lower.contains("sensevoice") || lower.contains("sv-") || lower.contains("funasr") || lower.contains("paraformer");
    if extension == "onnx" && !looks_like_sensevoice {
        Some(
            "This model is an ONNX file, but the built-in engine (sona) can only load SenseVoice \
             (ONNX), Whisper (GGML/GGUF) and Nemotron/Parakeet (GGUF) models.\n\n\
             该模型为 ONNX 格式，但内置转录引擎（sona）仅支持 SenseVoice（ONNX）、\
             Whisper（GGML/GGUF）与 Nemotron/Parakeet（GGUF）模型。\n\n\
             Please use a supported model format instead — e.g. download a SenseVoice ONNX model, \
             a Whisper GGML model (ggml-large-v3-turbo-q8_0.bin) or a Nemotron/Parakeet GGUF model."
                .to_string(),
        )
    } else {
        None
    }
}

#[tauri::command]
pub async fn load_model(
    app_handle: tauri::AppHandle,
    model_path: String,
    gpu_device: Option<i32>,
    unload_timeout_minutes: u32,
) -> Result<String> {
    // B3: Validate model file before attempting load
    let file_size = validate_model_file(&model_path).map_err(|e| {
        tracing::error!("model validation failed for {}: {:#}", model_path, e);
        e
    })?;

    // Reject model formats the sona engine cannot load before spawning it, so
    // the user gets a clear message instead of a failed GPU/CPU retry loop.
    if let Some(hint) = unsupported_model_hint(&model_path) {
        tracing::warn!("model format unsupported by engine: {} ({})", model_path, hint);
        return Err(eyre::eyre!("{hint}"));
    }

    let sona_state: State<'_, Mutex<SonaState>> = app_handle.state();
    let mut state_guard = sona_state.lock().await;

    let process_is_alive = state_guard.process.as_mut().is_some_and(crate::sona::SonaProcess::is_alive);
    if !process_is_alive {
        if state_guard.process.is_some() {
            tracing::warn!("cached sona process is no longer running; restarting it");
        }
        state_guard.process = None;
        state_guard.loaded_model_path = None;
        state_guard.loaded_gpu_device = None;
    }

    // Restart sona if the unload timeout changed so the new value takes effect.
    if state_guard
        .process
        .as_ref()
        .is_some_and(|process| process.unload_timeout_minutes() != unload_timeout_minutes)
    {
        tracing::debug!(unload_timeout_minutes, "restarting sona to apply unload timeout");
        // Dropping SonaProcess kills and waits for its child process via its Drop implementation.
        state_guard.process = None;
        state_guard.loaded_model_path = None;
        state_guard.loaded_gpu_device = None;
    }

    // Check if model already loaded with same gpu_device. The sona server
    // unloads the model on its own once its inactivity timeout elapses, so the
    // local `loaded_model_path` cache can go stale: the model may already be
    // gone on the server even though we think it is loaded. Verify with the
    // server (`GET /ready` is 200 only while a model is loaded) before
    // trusting the cache; if the model was unloaded, fall through to the real
    // load path below.
    if let Some(ref loaded_path) = state_guard.loaded_model_path {
        if *loaded_path == model_path && state_guard.loaded_gpu_device == gpu_device {
            let still_loaded = match state_guard.process.as_mut() {
                Some(process) => {
                    if !process.is_alive() {
                        false
                    } else {
                        process.model_loaded().await.unwrap_or(false)
                    }
                }
                None => false,
            };
            if still_loaded {
                tracing::debug!("model already loaded, skipping");
                state_guard.unload_timeout_minutes = unload_timeout_minutes;
                return Ok(model_path);
            }
            tracing::warn!("model cache says loaded but sona reports no model; reloading");
        }
    }

    let spawn_sona = || -> Result<crate::sona::SonaProcess> {
        let binary_path = resolve_sona_binary(&app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(&app_handle);
        crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref(), gpu_device, unload_timeout_minutes)
    };

    // Spawn sona if not running
    if state_guard.process.is_none() {
        match spawn_sona() {
            Ok(process) => state_guard.process = Some(process),
            Err(e) => {
                let error_msg = format!("{:#}", e);
                crate::analytics::track_event_handle_with_props(
                    &app_handle,
                    crate::analytics::events::SONA_SPAWN_FAILED,
                    Some(serde_json::json!({"error_message": error_msg})),
                );
                return Err(e);
            }
        }
    }

    // D3: Pre-check GPU availability
    let has_gpu = if gpu_device.is_none() {
        true // auto mode: let sona decide
    } else {
        match resolve_sona_binary(&app_handle) {
            Ok(binary_path) => match crate::sona::list_gpu_devices(&binary_path) {
                Ok(devices) => {
                    let available = !devices.is_empty();
                    if !available {
                        tracing::warn!("no GPU devices detected by sona, will skip GPU attempt");
                    }
                    available
                }
                Err(e) => {
                    tracing::warn!("failed to list GPU devices: {:#}, proceeding with GPU attempt", e);
                    true
                }
            },
            Err(e) => {
                tracing::warn!(
                    "failed to resolve sona binary for GPU check: {:#}, proceeding with GPU attempt",
                    e
                );
                true
            }
        }
    };

    // Load model via HTTP
    let load_result = if has_gpu {
        let sona = state_guard.process.as_mut().unwrap();
        sona.load_model(&model_path, gpu_device, false).await
    } else {
        Err(eyre::eyre!("no GPU devices detected, skipping GPU attempt"))
    };

    let gpu_fallback = match load_result {
        Ok(()) => false,
        Err(e) => {
            let error_msg = format!("{:#}", e);
            // B2: Enhanced error diagnostics
            tracing::error!(
                "model load failed: path={}, size={} bytes ({:.2} GB), gpu_device={:?}, error={}",
                model_path,
                file_size,
                file_size as f64 / 1_073_741_824.0,
                gpu_device,
                error_msg
            );
            tracing::warn!("model load failed with GPU enabled, falling back to CPU: {}", error_msg);

            // Emit event so frontend can show persistent warning
            let _ = app_handle.emit(
                "gpu_fallback",
                serde_json::json!({
                    "error": error_msg,
                }),
            );

            // Track analytics
            crate::analytics::track_event_handle_with_props(
                &app_handle,
                crate::analytics::events::SONA_SPAWN_FAILED,
                Some(
                    serde_json::json!({"error_message": error_msg, "type": "gpu_fallback", "file_size": file_size, "gpu_device": gpu_device}),
                ),
            );

            // Kill existing process and respawn, then reload with no_gpu
            if let Some(mut old) = state_guard.process.take() {
                old.kill();
            }
            let process = spawn_sona().context("failed to respawn sona")?;
            state_guard.process = Some(process);

            let sona = state_guard.process.as_mut().unwrap();
            let cpu_result = sona.load_model(&model_path, gpu_device, true).await;
            if let Err(ref cpu_err) = cpu_result {
                let cpu_err_msg = format!("{:#}", cpu_err);
                tracing::error!(
                    "model load failed on CPU fallback: path={}, size={} bytes, error={}",
                    model_path,
                    file_size,
                    cpu_err_msg
                );
                // B4: Suggest quantization downgrade for F16 models
                if is_f16_model(&model_path) {
                    return Err(eyre::eyre!(
                        "Failed to load F16 model. The model may be too large for available memory. \
                         Consider using a quantized version such as Q8_0 or Q4_K_M. \
                         Original error: {}",
                        cpu_err_msg
                    ));
                }
            }
            cpu_result?;
            true
        }
    };
    state_guard.loaded_model_path = Some(model_path.clone());
    state_guard.loaded_gpu_device = gpu_device;
    state_guard.unload_timeout_minutes = unload_timeout_minutes;

    if gpu_fallback {
        Ok("gpu_fallback".to_string())
    } else {
        Ok(model_path)
    }
}

#[tauri::command]
pub async fn get_gpu_devices(app_handle: tauri::AppHandle) -> Result<Vec<crate::sona::GpuDevice>> {
    let binary_path = resolve_sona_binary(&app_handle)?;
    let devices = crate::sona::list_gpu_devices(&binary_path)?;
    Ok(devices)
}

#[tauri::command]
pub async fn get_model_metadata(app_handle: tauri::AppHandle, model_path: String) -> Result<crate::sona::ModelMetadata> {
    let sona_state: State<'_, Mutex<SonaState>> = app_handle.state();
    let mut state = sona_state.lock().await;
    if state.process.as_mut().is_none_or(|process| !process.is_alive()) {
        let binary_path = resolve_sona_binary(&app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(&app_handle);
        let gpu_device = state.loaded_gpu_device;
        let unload_timeout_minutes = state.unload_timeout_minutes;
        state.process = Some(crate::sona::SonaProcess::spawn(
            &binary_path,
            ffmpeg_path.as_deref(),
            gpu_device,
            unload_timeout_minutes,
        )?);
        state.loaded_model_path = None;
        state.loaded_gpu_device = None;
    }
    state.process.as_ref().unwrap().model_metadata(&model_path).await
}

#[tauri::command]
pub async fn get_api_base_url(sona_state: State<'_, Mutex<SonaState>>) -> Result<Option<String>> {
    let state = sona_state.lock().await;
    Ok(state.process.as_ref().map(|process| process.base_url()))
}

#[tauri::command]
pub async fn start_api_server(
    app_handle: tauri::AppHandle,
    sona_state: State<'_, Mutex<SonaState>>,
    unload_timeout_minutes: u32,
) -> Result<String> {
    let mut state_guard = sona_state.lock().await;
    // Restart sona if the unload timeout changed so the new value takes effect.
    if state_guard
        .process
        .as_ref()
        .is_some_and(|process| process.unload_timeout_minutes() != unload_timeout_minutes)
    {
        tracing::debug!(unload_timeout_minutes, "restarting sona to apply unload timeout");
        // Dropping SonaProcess kills and waits for its child process via its Drop implementation.
        state_guard.process = None;
        state_guard.loaded_model_path = None;
        state_guard.loaded_gpu_device = None;
    }
    if state_guard.process.is_none() {
        let binary_path = resolve_sona_binary(&app_handle)?;
        let ffmpeg_path = resolve_ffmpeg_path(&app_handle);
        let gpu_device = state_guard.loaded_gpu_device;
        let process = crate::sona::SonaProcess::spawn(&binary_path, ffmpeg_path.as_deref(), gpu_device, unload_timeout_minutes)?;
        state_guard.process = Some(process);
        state_guard.unload_timeout_minutes = unload_timeout_minutes;
    }
    let process = state_guard.process.as_ref().context("API server process missing")?;
    Ok(process.base_url())
}

#[tauri::command]
pub async fn stop_api_server(sona_state: State<'_, Mutex<SonaState>>) -> Result<bool> {
    let mut state_guard = sona_state.lock().await;
    if let Some(mut process) = state_guard.process.take() {
        process.kill();
        state_guard.loaded_model_path = None;
        state_guard.loaded_gpu_device = None;
        return Ok(true);
    }
    Ok(false)
}
