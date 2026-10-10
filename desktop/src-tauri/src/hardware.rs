//! Hardware detection used to size the transcription worker pool and to pick
//! runtime defaults that match the machine actually running the app.
//!
//! Everything here is best-effort: an unknown value must never block
//! transcription, it only makes the sizing more conservative.

use serde::Serialize;
use std::sync::OnceLock;

/// VRAM (MB) left to the OS, the desktop compositor and the WebView.
const GPU_RESERVE_MB: u64 = 512;
/// Per-worker VRAM overhead (MB) on top of the model weights: whisper.cpp keeps
/// the audio / encoder / decoder compute buffers on the device.
const PER_WORKER_OVERHEAD_MB: u64 = 1200;
/// Host RAM (MB) every worker needs regardless of the GPU buffers.
const PER_WORKER_RAM_MB: u64 = 768;
/// Never run more than this many inference processes in parallel.
pub const MAX_WORKERS: usize = 4;
/// Hardware threads handed to whisper.cpp when no explicit value is configured.
pub const MIN_THREADS: usize = 4;
pub const MAX_THREADS: usize = 16;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub index: i32,
    pub name: String,
    pub description: String,
    /// `gpu` for a discrete card, `igpu` for an integrated one.
    pub device_type: String,
    /// `None` when the platform cannot report it; sizing then stays conservative.
    pub vram_bytes: Option<u64>,
    /// Where the VRAM figure came from (`nvidia-smi`, `dxgi`), for diagnostics.
    pub vram_source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub cpu_brand: String,
    pub cpu_physical_cores: usize,
    pub cpu_logical_cores: usize,
    pub total_ram_bytes: u64,
    pub gpus: Vec<GpuInfo>,
    /// GPU that should be used when the user left the device on "auto".
    pub recommended_gpu_device: Option<i32>,
    /// Whisper-friendly thread count for this CPU (physical cores, clamped).
    pub recommended_threads: usize,
}

static CACHE: OnceLock<HardwareInfo> = OnceLock::new();

/// Returns the cached hardware snapshot, gathering it on first use.
///
/// Detection spawns `sona devices` and (on Windows) touches DXGI, so it must
/// not run per transcription; the result only changes if hardware does.
pub fn info(binary_path: Option<&std::path::Path>) -> HardwareInfo {
    if let Some(cached) = CACHE.get() {
        return cached.clone();
    }
    let detected = detect(binary_path);
    let _ = CACHE.set(detected.clone());
    detected
}

fn detect(binary_path: Option<&std::path::Path>) -> HardwareInfo {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    system.refresh_cpu();

    let cpu_logical_cores = system.cpus().len().max(1);
    let cpu_physical_cores = system.physical_core_count().unwrap_or(cpu_logical_cores).max(1);
    let cpu_brand = system
        .cpus()
        .first()
        .map(|cpu| cpu.brand().trim().to_string())
        .unwrap_or_default();

    let gpus = binary_path.map(collect_gpus).unwrap_or_default();
    let recommended_gpu_device = pick_gpu(&gpus);

    HardwareInfo {
        cpu_brand,
        cpu_physical_cores,
        cpu_logical_cores,
        total_ram_bytes: system.total_memory(),
        gpus,
        recommended_gpu_device,
        recommended_threads: recommended_threads(cpu_physical_cores),
    }
}

pub fn recommended_threads(physical_cores: usize) -> usize {
    physical_cores.clamp(MIN_THREADS, MAX_THREADS)
}

/// Enumerates the devices sona can use and enriches them with VRAM figures.
fn collect_gpus(binary_path: &std::path::Path) -> Vec<GpuInfo> {
    let devices = match crate::sona::list_gpu_devices(binary_path) {
        Ok(devices) => devices,
        Err(error) => {
            tracing::warn!("failed to list gpu devices for hardware info: {error:#}");
            return Vec::new();
        }
    };

    let mut vram: Vec<(String, u64, &'static str)> = Vec::new();
    match nvidia_smi_memory() {
        Ok(entries) if !entries.is_empty() => {
            vram.extend(entries.into_iter().map(|(name, bytes)| (name, bytes, "nvidia-smi")));
        }
        Ok(_) => {}
        Err(error) => tracing::debug!("nvidia-smi unavailable: {error}"),
    }
    #[cfg(target_os = "windows")]
    match dxgi_memory() {
        Ok(entries) if !entries.is_empty() => {
            vram.extend(entries.into_iter().map(|(name, bytes)| (name, bytes, "dxgi")));
        }
        Ok(_) => {}
        Err(error) => tracing::debug!("dxgi adapter query unavailable: {error}"),
    }

    let mut unmatched = vram;
    let mut enriched = Vec::with_capacity(devices.len());
    for device in devices {
        let matched = unmatched.iter().position(|(name, _, _)| names_match(name, &device.name));
        let (vram_bytes, vram_source) = match matched {
            Some(position) => {
                let (_, bytes, source) = unmatched.remove(position);
                (Some(bytes), Some(source.to_string()))
            }
            None => (None, None),
        };
        enriched.push(GpuInfo {
            index: device.index,
            name: device.name,
            description: device.description,
            device_type: device.device_type,
            vram_bytes,
            vram_source,
        });
    }
    enriched
}

/// Loose name comparison between the Vulkan device name and the name reported
/// by `nvidia-smi` / DXGI (for example `NVIDIA GeForce RTX 4090` vs
/// `NVIDIA GeForce RTX 4090/PCIe/SSE2`).
fn names_match(left: &str, right: &str) -> bool {
    let normalize = |value: &str| -> String {
        value
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase()
    };
    let left = normalize(left);
    let right = normalize(right);
    if left.is_empty() || right.is_empty() {
        return false;
    }
    left.contains(&right) || right.contains(&left)
}

/// Prefers a discrete card, then the device with the most VRAM.
fn pick_gpu(gpus: &[GpuInfo]) -> Option<i32> {
    let discrete = gpus.iter().filter(|gpu| gpu.device_type == "gpu").collect::<Vec<_>>();
    let candidates = if discrete.is_empty() {
        gpus.iter().collect::<Vec<_>>()
    } else {
        discrete
    };
    candidates
        .into_iter()
        .max_by_key(|gpu| gpu.vram_bytes.unwrap_or(0))
        .map(|gpu| gpu.index)
}

/// `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`
fn nvidia_smi_memory() -> eyre::Result<Vec<(String, u64)>> {
    let mut command = std::process::Command::new("nvidia-smi");
    command.args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output()?;
    if !output.status.success() {
        return Err(eyre::eyre!("nvidia-smi exited with {}", output.status));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_smi_output(&text))
}

fn parse_smi_output(text: &str) -> Vec<(String, u64)> {
    text.lines()
        .filter_map(|line| {
            let (name, memory) = line.split_once(',')?;
            let megabytes: u64 = memory.trim().parse().ok()?;
            if megabytes == 0 {
                return None;
            }
            Some((name.trim().to_string(), megabytes * 1024 * 1024))
        })
        .collect()
}

#[cfg(target_os = "windows")]
fn dxgi_memory() -> eyre::Result<Vec<(String, u64)>> {
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};

    let mut entries = Vec::new();
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1()?;
        let mut index = 0u32;
        loop {
            let Ok(adapter) = factory.EnumAdapters1(index) else {
                break;
            };
            index += 1;
            let Ok(description) = adapter.GetDesc1() else {
                continue;
            };
            if description.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
                continue;
            }
            let name = description
                .Description
                .iter()
                .take_while(|character| **character != 0)
                .copied()
                .collect::<Vec<u16>>();
            let memory = description.DedicatedVideoMemory as u64;
            if memory == 0 {
                continue;
            }
            entries.push((String::from_utf16_lossy(&name), memory));
        }
    }
    Ok(entries)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "code")]
pub enum PerfReason {
    /// The high-performance mode is switched off by the user.
    Disabled,
    /// No usable GPU (or the user forced CPU): one process, all cores.
    CpuOnly { physical_cores: usize },
    /// GPU with a known amount of memory: several workers fit side by side.
    Parallel {
        vram_gb: f64,
        model_gb: f64,
        per_worker_gb: f64,
    },
    /// GPU with a known amount of memory that only fits a single model.
    SingleWorkerLowVram { vram_gb: f64, model_gb: f64 },
    /// Integrated GPU: it shares system memory and compute with the CPU, and
    /// running a second process against it measured *slower* than one process.
    IntegratedGpu,
    /// GPU whose memory could not be determined (conservative default).
    UnknownVram { workers: usize },
    /// Host RAM is the limiting factor.
    MemoryLimited { ram_gb: f64 },
    /// The GPU load failed earlier and sona already fell back to the CPU.
    GpuFallback,
    /// The user picked the worker count by hand.
    Overridden { workers: usize },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfProfile {
    /// Whether several inference processes may run at once.
    pub parallel: bool,
    pub workers: usize,
    /// Threads each process should use.
    pub threads: usize,
    /// GPU device to load the model on (`None` = let sona decide / CPU only).
    pub gpu_device: Option<i32>,
    pub reason: PerfReason,
}

pub struct PerfInput {
    pub model_size_bytes: u64,
    pub enabled: bool,
    pub force_cpu: bool,
    pub override_workers: Option<usize>,
    pub gpu_fallback: bool,
}

/// Sizes the worker pool for the given model and hardware.
///
/// Returns `workers = 1` whenever parallelism is unavailable, so callers never
/// have to special-case it.
pub fn recommend_profile(hardware: &HardwareInfo, input: &PerfInput) -> PerfProfile {
    let threads = hardware.recommended_threads;
    let gpu = gpu_device_index(hardware, input.force_cpu);
    let gpu_info = gpu.and_then(|index| hardware.gpus.iter().find(|device| device.index == index));
    let known_vram = gpu_info.and_then(|device| device.vram_bytes);

    let single = |reason: PerfReason| PerfProfile {
        parallel: false,
        workers: 1,
        threads,
        gpu_device: gpu,
        reason,
    };

    if !input.enabled {
        return single(PerfReason::Disabled);
    }
    if input.gpu_fallback {
        return single(PerfReason::GpuFallback);
    }

    let model_mb = input.model_size_bytes / (1024 * 1024);
    let ram_mb = hardware.total_ram_bytes / (1024 * 1024);
    let ram_limited_workers = ((ram_mb.saturating_sub(2048)) / PER_WORKER_RAM_MB).max(1) as usize;
    if ram_limited_workers < 2 {
        return single(PerfReason::MemoryLimited {
            ram_gb: hardware.total_ram_bytes as f64 / 1024.0 / 1024.0 / 1024.0,
        });
    }

    let max_workers = MAX_WORKERS.min(ram_limited_workers);
    let requested = input.override_workers.map(|workers| workers.clamp(1, max_workers));

    if gpu.is_none() {
        // Concurrency cannot help a CPU-bound run: the engine already uses
        // every thread it is given.
        return match requested {
            Some(workers) => PerfProfile {
                parallel: workers > 1,
                workers,
                threads,
                gpu_device: None,
                reason: PerfReason::Overridden { workers },
            },
            None => single(PerfReason::CpuOnly {
                physical_cores: hardware.cpu_physical_cores,
            }),
        };
    }

    // An integrated GPU is a shared, bandwidth-limited device: a second process
    // competing for it measured about half the throughput of a single one, so
    // only a discrete card is worth pooling (an explicit override still wins).
    let selected_is_integrated = match gpu_info {
        Some(device) => device.device_type == "igpu",
        None => hardware.gpus.iter().all(|device| device.device_type == "igpu"),
    };
    if selected_is_integrated && requested.is_none() {
        return single(PerfReason::IntegratedGpu);
    }

    match known_vram {
        Some(vram_bytes) => {
            let vram_mb = vram_bytes / (1024 * 1024);
            let per_worker_mb = (model_mb * 115 / 100 + PER_WORKER_OVERHEAD_MB).max(1);
            let fits = ((vram_mb.saturating_sub(GPU_RESERVE_MB)) / per_worker_mb).max(1) as usize;
            let fits = fits.min(max_workers);
            let workers = requested.map_or(fits, |workers| workers.min(fits));
            let reason = match requested {
                Some(workers) => PerfReason::Overridden { workers },
                None if workers > 1 => PerfReason::Parallel {
                    vram_gb: vram_mb as f64 / 1024.0,
                    model_gb: model_mb as f64 / 1024.0,
                    per_worker_gb: per_worker_mb as f64 / 1024.0,
                },
                None => PerfReason::SingleWorkerLowVram {
                    vram_gb: vram_mb as f64 / 1024.0,
                    model_gb: model_mb as f64 / 1024.0,
                },
            };
            tracing::debug!(
                "perf profile: vram={}MB model={}MB workers={} cores={}",
                vram_mb,
                model_mb,
                workers,
                hardware.cpu_physical_cores
            );
            PerfProfile {
                parallel: workers > 1,
                workers,
                threads,
                gpu_device: gpu,
                reason,
            }
        }
        None => {
            // Without a VRAM figure the safest useful default is two workers
            // for small models; larger models stay single-process.
            let heuristic = if model_mb < 2 * 1024 { 2usize.min(max_workers) } else { 1 };
            let workers = requested.map_or(heuristic, |workers| workers.min(max_workers));
            PerfProfile {
                parallel: workers > 1,
                workers,
                threads,
                gpu_device: gpu,
                reason: match requested {
                    Some(workers) => PerfReason::Overridden { workers },
                    None => PerfReason::UnknownVram { workers },
                },
            }
        }
    }
}

fn gpu_device_index(hardware: &HardwareInfo, force_cpu: bool) -> Option<i32> {
    if force_cpu || hardware.gpus.is_empty() {
        None
    } else {
        Some(hardware.recommended_gpu_device.unwrap_or(-1))
    }
}

/// Thread count for CPUs, without paying for GPU detection.
///
/// Used when a transcription request does not specify a thread count, so the
/// engine gets every physical core instead of a hardcoded default.
pub fn cpu_threads() -> usize {
    static THREADS: OnceLock<usize> = OnceLock::new();
    *THREADS.get_or_init(|| {
        let mut system = sysinfo::System::new();
        system.refresh_cpu();
        let logical = system.cpus().len().max(1);
        recommended_threads(system.physical_core_count().unwrap_or(logical).max(1))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hardware(vram: Option<u64>, ram_gb: u64) -> HardwareInfo {
        HardwareInfo {
            cpu_brand: "test".into(),
            cpu_physical_cores: 8,
            cpu_logical_cores: 16,
            total_ram_bytes: ram_gb * 1024 * 1024 * 1024,
            gpus: match vram {
                Some(bytes) => vec![GpuInfo {
                    index: 0,
                    name: "NVIDIA GeForce RTX 4090".into(),
                    description: "RTX 4090".into(),
                    device_type: "gpu".into(),
                    vram_bytes: Some(bytes),
                    vram_source: Some("dxgi".into()),
                }],
                None => Vec::new(),
            },
            recommended_gpu_device: vram.map(|_| 0),
            recommended_threads: 8,
        }
    }

    fn input(model_gb: u64, enabled: bool) -> PerfInput {
        PerfInput {
            model_size_bytes: model_gb * 1024 * 1024 * 1024,
            enabled,
            force_cpu: false,
            override_workers: None,
            gpu_fallback: false,
        }
    }

    #[test]
    fn large_vram_runs_a_pool_of_workers() {
        let profile = recommend_profile(&hardware(Some(24 * 1024 * 1024 * 1024), 32), &input(3, true));
        assert!(profile.parallel);
        assert!(profile.workers > 1, "expected a pool, got {}", profile.workers);
        assert_eq!(profile.gpu_device, Some(0));
    }

    #[test]
    fn small_vram_stays_single_process() {
        let profile = recommend_profile(&hardware(Some(2 * 1024 * 1024 * 1024), 16), &input(3, true));
        assert!(!profile.parallel);
        assert_eq!(profile.workers, 1);
    }

    #[test]
    fn cpu_only_never_pools() {
        let profile = recommend_profile(&hardware(None, 16), &input(3, true));
        assert!(!profile.parallel);
        assert_eq!(profile.workers, 1);
        assert!(matches!(profile.reason, PerfReason::CpuOnly { .. }));
    }

    #[test]
    fn disabled_mode_forces_a_single_worker() {
        let profile = recommend_profile(&hardware(Some(24 * 1024 * 1024 * 1024), 32), &input(3, false));
        assert!(!profile.parallel);
        assert_eq!(profile.workers, 1);
        assert!(matches!(profile.reason, PerfReason::Disabled));
    }

    #[test]
    fn unknown_vram_is_conservative_for_large_models() {
        let mut hw = hardware(None, 32);
        hw.gpus = vec![GpuInfo {
            index: 0,
            name: "AMD Radeon RX 7900".into(),
            description: "AMD Radeon RX 7900".into(),
            device_type: "gpu".into(),
            vram_bytes: None,
            vram_source: None,
        }];
        hw.recommended_gpu_device = Some(0);
        let profile = recommend_profile(&hw, &input(3, true));
        assert_eq!(profile.workers, 1);

        let small = recommend_profile(&hw, &input(1, true));
        assert_eq!(small.workers, 2);
    }

    #[test]
    fn override_is_clamped_to_what_fits() {
        let mut perf_input = input(1, true);
        perf_input.override_workers = Some(9);
        let profile = recommend_profile(&hardware(Some(8 * 1024 * 1024 * 1024), 32), &perf_input);
        assert!(profile.workers <= MAX_WORKERS, "got {}", profile.workers);
        assert!(profile.workers >= 1);
    }

    #[test]
    fn integrated_gpus_stay_single_process() {
        let mut hw = hardware(Some(8 * 1024 * 1024 * 1024), 16);
        hw.gpus[0].device_type = "igpu".into();
        let profile = recommend_profile(&hw, &input(1, true));
        assert!(!profile.parallel);
        assert_eq!(profile.workers, 1);
        assert!(matches!(profile.reason, PerfReason::IntegratedGpu));
    }

    #[test]
    fn an_override_bypasses_the_integrated_gpu_gate_but_still_fits_memory() {
        let mut hw = hardware(Some(8 * 1024 * 1024 * 1024), 16);
        hw.gpus[0].device_type = "igpu".into();

        let mut two = input(1, true);
        two.override_workers = Some(2);
        assert_eq!(recommend_profile(&hw, &two).workers, 2);

        // Beyond what the detected memory fits, the request is still clamped.
        let mut four = input(1, true);
        four.override_workers = Some(4);
        let clamped = recommend_profile(&hw, &four).workers;
        assert!((2..=3).contains(&clamped), "expected a memory clamp, got {clamped}");
    }

    #[test]
    fn gpu_fallback_disables_parallelism() {
        let mut perf_input = input(3, true);
        perf_input.gpu_fallback = true;
        let profile = recommend_profile(&hardware(Some(24 * 1024 * 1024 * 1024), 32), &perf_input);
        assert!(!profile.parallel);
        assert!(matches!(profile.reason, PerfReason::GpuFallback));
    }

    #[test]
    fn parses_nvidia_smi_output() {
        let entries = parse_smi_output("NVIDIA GeForce RTX 4090, 24564\nNVIDIA GeForce RTX 3060, 12288\n");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].0, "NVIDIA GeForce RTX 4090");
        assert_eq!(entries[0].1, 24564 * 1024 * 1024);
    }

    #[test]
    fn matches_gpu_names_across_apis() {
        assert!(names_match("NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 4090/PCIe/SSE2"));
        assert!(!names_match("Intel(R) UHD Graphics", "AMD Radeon RX 7900 XTX"));
    }
}
