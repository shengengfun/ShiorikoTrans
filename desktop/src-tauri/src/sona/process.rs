use super::{ReadySignal, SonaProcess, SONA_PID};
use eyre::{bail, Context, ContextCompat, Result};
use std::io::BufRead;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};

/// Runs the inference sidecar at below-normal priority.
///
/// The engine saturates every core while transcribing, which used to starve the
/// webview process and make the window controls (minimise / maximise / close are
/// drawn by the app itself) feel frozen. Dropping the sidecar one priority class
/// keeps the UI snappy at the cost of a few percent throughput.
#[cfg(target_os = "windows")]
fn lower_process_priority(pid: u32) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, SetPriorityClass, BELOW_NORMAL_PRIORITY_CLASS, PROCESS_SET_INFORMATION,
    };
    unsafe {
        match OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
            Ok(handle) => {
                if let Err(error) = SetPriorityClass(handle, BELOW_NORMAL_PRIORITY_CLASS) {
                    tracing::warn!("failed to lower sona priority: {error}");
                } else {
                    tracing::debug!("sona process {} set to below-normal priority", pid);
                }
                let _ = CloseHandle(handle);
            }
            Err(error) => tracing::warn!("failed to open sona process {}: {error}", pid),
        }
    }
}

impl SonaProcess {
    pub fn spawn(
        binary_path: &Path,
        ffmpeg_path: Option<&Path>,
        gpu_device: Option<i32>,
        unload_timeout_minutes: u32,
    ) -> Result<Self> {
        tracing::debug!("spawning sona at {}", binary_path.display());
        let unload_timeout = if unload_timeout_minutes == 0 {
            "0".to_string()
        } else {
            format!("{unload_timeout_minutes}m")
        };
        let mut cmd = Command::new(binary_path);
        let mut args: Vec<String> = vec!["serve".into(), "--port".into(), "0".into()];
        if let Some(device) = gpu_device {
            args.push("--gpu-device".into());
            args.push(device.to_string());
        }
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("SONA_UNLOAD_TIMEOUT", unload_timeout);

        if let Some(ffmpeg) = ffmpeg_path {
            tracing::debug!("setting SONA_FFMPEG_PATH={}", ffmpeg.display());
            cmd.env("SONA_FFMPEG_PATH", ffmpeg);
        }

        // D6: Vulkan environment variables on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
            if let Some(device) = gpu_device {
                cmd.env("VK_DEVICE_INDEX", device.to_string());
            }
            cmd.env("VK_LOADER_LAYERS_DISABLE", "VK_LAYER_KHRONOS_validation");
        }

        let mut child = cmd.spawn().map_err(|e| {
            let path_display = binary_path.display();
            let extra_info = match e.raw_os_error() {
                Some(193) => {
                    let size = std::fs::metadata(binary_path).map(|m| m.len()).unwrap_or(0);
                    format!(
                        " - os error 193: the binary at '{}' ({} bytes) is not a valid Win32 application. \
                         This may indicate architecture mismatch (e.g. ARM64 vs x86_64), a corrupted download, \
                         or the file is not a real executable.",
                        path_display, size
                    )
                }
                Some(5) => format!(
                    " - os error 5: access denied. Check antivirus or file permissions for '{}'",
                    path_display
                ),
                _ => String::new(),
            };
            eyre::eyre!("failed to spawn sona binary at '{}'{}: {}", path_display, extra_info, e)
        })?;
        // Store PID globally for synchronous cleanup during app exit
        let pid = child.id();
        SONA_PID.store(pid, std::sync::atomic::Ordering::SeqCst);
        tracing::debug!("sona process spawned with PID {}", pid);
        #[cfg(target_os = "windows")]
        lower_process_priority(pid);
        let mut stderr = child.stderr.take();
        let stdout = child.stdout.take().context("failed to get sona stdout")?;
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        let mut read_stderr = || -> String {
            let Some(stderr) = stderr.take() else {
                return String::new();
            };
            let mut output = String::new();
            let _ = std::io::BufReader::new(stderr).read_line(&mut output);
            output.truncate(4096);
            output
        };

        if let Err(error) = reader.read_line(&mut line) {
            let stderr_output = read_stderr();
            if stderr_output.is_empty() {
                return Err(error).context("failed to read sona ready signal");
            }
            bail!(
                "failed to read sona ready signal: {error}\n\nsona stderr: {}",
                stderr_output.trim()
            );
        }
        let signal: ReadySignal = serde_json::from_str(line.trim()).map_err(|error| {
            let stderr_output = read_stderr();
            if stderr_output.is_empty() {
                eyre::eyre!("failed to parse sona ready signal: {error}")
            } else {
                eyre::eyre!(
                    "failed to parse sona ready signal: {error}\n\nsona stderr: {}",
                    stderr_output.trim()
                )
            }
        })?;
        tracing::debug!("sona ready on port {}", signal.port);

        std::thread::spawn(move || {
            let mut line = String::new();
            while reader.read_line(&mut line).unwrap_or(0) > 0 {
                tracing::trace!("sona stdout: {}", line.trim());
                line.clear();
            }
        });
        let stderr_buf = Arc::new(Mutex::new(String::new()));
        if let Some(stderr) = stderr {
            let buf_clone = stderr_buf.clone();
            std::thread::spawn(move || {
                let mut reader = std::io::BufReader::new(stderr);
                let mut line = String::new();
                while reader.read_line(&mut line).unwrap_or(0) > 0 {
                    tracing::debug!("sona stderr: {}", line.trim());
                    if let Ok(mut buf) = buf_clone.lock() {
                        if buf.len() < 8192 {
                            buf.push_str(&line);
                        }
                    }
                    line.clear();
                }
            });
        }

        Ok(Self {
            port: signal.port,
            unload_timeout_minutes,
            child,
            client: reqwest::Client::builder()
                .no_proxy()
                // Only guard the initial connection handshake; streaming
                // transcription must not have a total-request timeout (see
                // `transcribe_stream`). A hung stream is handled separately by
                // the per-event inactivity timeout in `cmd::transcribe`.
                .connect_timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap(),
            stderr_buf,
        })
    }

    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn client(&self) -> reqwest::Client {
        self.client.clone()
    }

    pub fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    pub fn unload_timeout_minutes(&self) -> u32 {
        self.unload_timeout_minutes
    }

    fn recent_stderr(&self) -> String {
        self.stderr_buf.lock().map(|buf| buf.trim().to_string()).unwrap_or_default()
    }

    /// Returns whether a model is currently loaded in the sona server.
    ///
    /// The server autonomously unloads the model once its inactivity timeout
    /// elapses, so the desktop-side `loaded_model_path` cache can go stale.
    /// `GET /ready` returns 200 only while a model is actually loaded (503
    /// otherwise), making this a cheap way to detect the server-side unload.
    pub async fn model_loaded(&self) -> Result<bool> {
        let url = format!("{}/ready", self.base_url());
        let response = self.client.get(&url).send().await.context("failed to check sona readiness")?;
        Ok(response.status().is_success())
    }

    pub async fn load_model(&mut self, path: &str, gpu_device: Option<i32>, no_gpu: bool) -> Result<()> {
        let url = format!("{}/v1/models/load", self.base_url());
        let mut body = serde_json::json!({"path": path});
        if let Some(device) = gpu_device {
            body["gpu_device"] = serde_json::json!(device);
        }
        if no_gpu {
            body["no_gpu"] = serde_json::json!(true);
        }

        let mut last_error = None;
        for attempt in 0..3 {
            if attempt > 0 {
                if !self.is_alive() {
                    let stderr = self.recent_stderr();
                    if stderr.is_empty() {
                        bail!("sona process died during model loading");
                    }
                    bail!("sona process died during model loading\n\nsona stderr: {stderr}");
                }
                tracing::debug!("retrying load_model (attempt {})", attempt + 1);
                tokio::time::sleep(std::time::Duration::from_millis(500 * (1 << attempt))).await;
            }
            match self.client.post(&url).json(&body).send().await {
                Ok(response) if response.status().is_success() => {
                    tracing::debug!("sona model loaded: {path}");
                    return Ok(());
                }
                Ok(response) => bail!("sona load_model failed: {}", response.text().await.unwrap_or_default()),
                Err(error) => last_error = Some(error),
            }
        }

        let error = Err(last_error.unwrap()).context("failed to send load_model request to sona after 3 attempts");
        let stderr = self.recent_stderr();
        if stderr.is_empty() {
            error
        } else {
            error.context(format!("sona stderr: {stderr}"))
        }
    }

    pub fn kill(&mut self) {
        tracing::debug!("killing sona process");
        let pid = self.child.id();

        // On Windows, use taskkill /F /T to kill the entire process tree.
        // child.kill() only terminates the main process, leaving child processes orphaned.
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            tracing::info!("killing sona process tree with PID {}", pid);
            let output = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output();
            match &output {
                Ok(o) if o.status.success() => {
                    tracing::info!("sona process tree killed successfully");
                }
                Ok(o) => {
                    tracing::warn!(
                        "taskkill exited with non-zero status: {}",
                        String::from_utf8_lossy(&o.stderr).trim()
                    );
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                }
                Err(e) => {
                    tracing::warn!("failed to run taskkill: {}, falling back to child.kill()", e);
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }

        SONA_PID.store(0, std::sync::atomic::Ordering::SeqCst);
    }
}

impl Drop for SonaProcess {
    fn drop(&mut self) {
        self.kill();
    }
}
