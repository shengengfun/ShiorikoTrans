//! A pool of `sona` inference processes.
//!
//! The sona server holds an exclusive lease on its loaded model, so a second
//! concurrent request is answered with `429 busy`. Parallel transcription
//! therefore has to come from several sidecar processes, each with its own
//! model and GPU context — which is what this pool manages.
//!
//! Workers are plain processes: the worker at the front of the list is the
//! *primary* one, i.e. the process the local API server and the model metadata
//! endpoints keep publishing. Extra workers are created lazily, only when a
//! request actually has work that can run in parallel, so a single short file
//! never pays for a second model load.

use eyre::{bail, Context, ContextCompat, Result};
use std::path::PathBuf;

use super::SonaProcess;
use crate::hardware::MAX_WORKERS;

/// The model a pool is serving, together with how it was loaded.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct LoadedModel {
    pub path: String,
    pub gpu_device: Option<i32>,
    pub no_gpu: bool,
}

struct Worker {
    id: u64,
    process: SonaProcess,
    busy: bool,
    model_path: Option<String>,
    gpu_device: Option<i32>,
    no_gpu: bool,
}

impl Worker {
    fn matches(&self, model: &LoadedModel) -> bool {
        self.model_path.as_deref() == Some(model.path.as_str())
            && self.gpu_device == model.gpu_device
            && self.no_gpu == model.no_gpu
    }

    fn is_alive(&mut self) -> bool {
        self.process.is_alive()
    }
}

/// A worker checked out for one transcription request.
///
/// The lease carries the worker id (not its index) so releasing it stays
/// correct even when other workers are dropped in the meantime.
pub struct SonaLease {
    pub id: u64,
    pub client: reqwest::Client,
    pub base_url: String,
}

/// What the caller should do next to obtain a worker.
pub enum AcquireStep {
    /// A worker is checked out and ready.
    Lease(SonaLease),
    /// The pool may create an extra worker for the loaded model.
    Grow,
    /// Every worker is busy: wait for a release and try again.
    Wait,
}

pub struct SonaPool {
    workers: Vec<Worker>,
    binary_path: Option<PathBuf>,
    ffmpeg_path: Option<PathBuf>,
    max_workers: usize,
    high_performance: bool,
    loaded: Option<LoadedModel>,
    unload_timeout_minutes: u32,
    degraded: bool,
    next_id: u64,
}

impl SonaPool {
    pub fn new() -> Self {
        Self {
            workers: Vec::new(),
            binary_path: None,
            ffmpeg_path: None,
            max_workers: 1,
            high_performance: false,
            loaded: None,
            unload_timeout_minutes: 5,
            degraded: false,
            next_id: 1,
        }
    }

    pub fn configure(&mut self, binary_path: PathBuf, ffmpeg_path: Option<PathBuf>) {
        self.binary_path = Some(binary_path);
        self.ffmpeg_path = ffmpeg_path;
    }

    /// Applies the worker budget derived from the hardware profile.
    pub fn set_limits(&mut self, max_workers: usize, high_performance: bool, unload_timeout_minutes: u32) {
        self.high_performance = high_performance;
        self.unload_timeout_minutes = unload_timeout_minutes;
        self.max_workers = max_workers.clamp(1, MAX_WORKERS);
        if self.degraded {
            self.max_workers = 1;
        }
        self.trim();
    }

    /// Drops the workers that no longer fit the budget (idle ones only).
    fn trim(&mut self) {
        while self.workers.len() > self.max_workers {
            let Some(index) = self.workers.iter().rposition(|worker| !worker.busy) else {
                break;
            };
            let mut worker = self.workers.remove(index);
            worker.process.kill();
        }
    }

    pub fn max_workers(&self) -> usize {
        self.max_workers
    }

    pub fn is_degraded(&self) -> bool {
        self.degraded
    }

    pub fn loaded(&self) -> Option<&LoadedModel> {
        self.loaded.as_ref()
    }

    pub fn set_loaded(&mut self, model: LoadedModel) {
        self.loaded = Some(model);
    }

    pub fn clear_loaded(&mut self) {
        self.loaded = None;
    }

    /// Records that the GPU load failed and sona fell back to the CPU: running
    /// several CPU-bound processes would only oversubscribe the machine, so the
    /// pool collapses to a single worker.
    pub fn mark_degraded(&mut self) {
        self.degraded = true;
        self.max_workers = 1;
        tracing::info!("sona fell back to cpu: limiting the pool to a single worker");
        self.trim();
    }

    pub fn mark_upgraded(&mut self, max_workers: usize) {
        self.degraded = false;
        self.set_limits(max_workers, self.high_performance, self.unload_timeout_minutes);
    }

    pub fn worker_count(&self) -> usize {
        self.workers.len()
    }

    pub fn primary(&self) -> Option<&SonaProcess> {
        self.workers.first().map(|worker| &worker.process)
    }

    /// True while the primary process is still running.
    pub fn primary_alive(&mut self) -> bool {
        match self.workers.first_mut() {
            Some(worker) => worker.is_alive(),
            None => false,
        }
    }

    /// Kills every worker and forgets the loaded model.
    pub fn reset(&mut self) {
        self.kill_all();
        self.clear_loaded();
    }

    pub fn kill_all(&mut self) {
        for mut worker in self.workers.drain(..) {
            worker.process.kill();
        }
    }

    /// Spawns the primary worker when there is none (or it died).
    pub fn ensure_primary(&mut self, gpu_device: Option<i32>, unload_timeout_minutes: u32) -> Result<()> {
        self.unload_timeout_minutes = unload_timeout_minutes;
        if self.primary_alive() {
            return Ok(());
        }
        if !self.workers.is_empty() {
            self.kill_all();
        }
        let process = self.spawn_process(gpu_device)?;
        let id = self.next_worker_id();
        self.workers.push(Worker {
            id,
            process,
            busy: false,
            model_path: None,
            gpu_device,
            no_gpu: false,
        });
        Ok(())
    }

    fn spawn_process(&self, gpu_device: Option<i32>) -> Result<SonaProcess> {
        let binary = self.binary_path.as_ref().context("sona binary path is not configured")?;
        SonaProcess::spawn(
            binary,
            self.ffmpeg_path.as_deref(),
            gpu_device,
            self.unload_timeout_minutes,
            self.high_performance,
        )
    }

    fn next_worker_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    /// Loads `model` into the worker with `id`.
    pub async fn load_into(&mut self, id: u64, model: &LoadedModel) -> Result<()> {
        let worker = self
            .workers
            .iter_mut()
            .find(|worker| worker.id == id)
            .context("worker is gone")?;
        worker
            .process
            .load_model(&model.path, model.gpu_device, model.no_gpu)
            .await
            .context("failed to load model into worker")?;
        worker.model_path = Some(model.path.clone());
        worker.gpu_device = model.gpu_device;
        worker.no_gpu = model.no_gpu;
        Ok(())
    }

    pub fn primary_id(&self) -> Option<u64> {
        self.workers.first().map(|worker| worker.id)
    }

    /// Decides how a transcription request should obtain a worker.
    pub fn plan_acquire(&mut self) -> Result<AcquireStep> {
        let model = self.loaded.clone().ok_or_else(|| eyre::eyre!("no model loaded"))?;
        self.prune_dead();
        let mut reusable = None;
        for index in 0..self.workers.len() {
            let worker = &mut self.workers[index];
            if worker.busy || !worker.matches(&model) {
                continue;
            }
            if worker.is_alive() {
                reusable = Some(index);
                break;
            }
        }
        if let Some(index) = reusable {
            self.workers[index].busy = true;
            let worker = &self.workers[index];
            tracing::debug!("leasing sona worker {} ({} workers in pool)", worker.id, self.workers.len());
            return Ok(AcquireStep::Lease(SonaLease {
                id: worker.id,
                client: worker.process.client(),
                base_url: worker.process.base_url(),
            }));
        }
        if self.workers.len() < self.max_workers {
            return Ok(AcquireStep::Grow);
        }
        Ok(AcquireStep::Wait)
    }

    /// Removes idle workers whose process died, so a crash does not permanently
    /// hold a slot of the pool.
    fn prune_dead(&mut self) {
        let mut index = 0;
        while index < self.workers.len() {
            let worker = &mut self.workers[index];
            let dead = !worker.busy && !worker.is_alive();
            if dead {
                tracing::warn!("dropping dead sona worker {}", worker.id);
                self.workers.remove(index);
            } else {
                index += 1;
            }
        }
    }

    /// Creates one extra worker for the currently loaded model.
    ///
    /// A failure here is never fatal for the request: the caller falls back to
    /// waiting for an existing worker.
    pub async fn grow(&mut self) -> Result<()> {
        let Some(model) = self.loaded.clone() else {
            bail!("no model loaded");
        };
        if self.workers.len() >= self.max_workers {
            bail!("pool is full");
        }
        let process = self.spawn_process(model.gpu_device)?;
        let id = self.next_worker_id();
        self.workers.push(Worker {
            id,
            process,
            busy: false,
            model_path: None,
            gpu_device: model.gpu_device,
            no_gpu: model.no_gpu,
        });
        tracing::debug!("grew sona pool to {} workers", self.workers.len());
        match self.load_into(id, &model).await {
            Ok(()) => Ok(()),
            Err(error) => {
                // A second process could not fit (typically out of memory): keep
                // the pool at one worker instead of retrying for every file.
                tracing::warn!("failed to load model into extra sona worker: {error:#}");
                self.kill_worker(id);
                self.mark_degraded();
                Err(error)
            }
        }
    }

    pub fn release(&mut self, id: u64) {
        if let Some(worker) = self.workers.iter_mut().find(|worker| worker.id == id) {
            worker.busy = false;
        }
    }

    pub fn kill_worker(&mut self, id: u64) {
        if let Some(index) = self.workers.iter().position(|worker| worker.id == id) {
            let mut worker = self.workers.remove(index);
            worker.process.kill();
        }
    }

    /// Reloads the model into a worker whose server-side model was unloaded by
    /// sona's own inactivity timeout. Respawning is only needed when the
    /// process itself died.
    pub async fn reload_worker(&mut self, id: u64) -> Result<()> {
        let model = self.loaded.clone().context("no model loaded")?;
        let index = self
            .workers
            .iter()
            .position(|worker| worker.id == id)
            .context("worker is gone")?;
        if !self.workers[index].is_alive() {
            self.kill_worker(id);
            let process = self.spawn_process(model.gpu_device)?;
            self.workers.push(Worker {
                id,
                process,
                busy: true,
                model_path: None,
                gpu_device: model.gpu_device,
                no_gpu: model.no_gpu,
            });
            if index == 0 {
                // Keep the primary at the front of the list.
                let last = self.workers.len() - 1;
                self.workers.swap(0, last);
            }
            self.load_into(id, &model).await?;
            return Ok(());
        }
        self.load_into(id, &model).await
    }

    /// Marks a worker's model as unknown (sona unloaded it) without killing it.
    pub fn forget_model(&mut self, id: u64) {
        if let Some(worker) = self.workers.iter_mut().find(|worker| worker.id == id) {
            worker.model_path = None;
        }
    }
}

impl Default for SonaPool {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pool_with_model(max_workers: usize) -> SonaPool {
        let mut pool = SonaPool::new();
        pool.set_limits(max_workers, true, 5);
        pool.set_loaded(LoadedModel {
            path: "/tmp/model.bin".into(),
            gpu_device: Some(0),
            no_gpu: false,
        });
        pool
    }

    #[test]
    fn limits_are_clamped_to_the_supported_range() {
        let mut pool = SonaPool::new();
        pool.set_limits(99, true, 5);
        assert_eq!(pool.max_workers(), MAX_WORKERS);
    }

    #[test]
    fn degradation_collapses_the_pool() {
        let mut pool = pool_with_model(4);
        assert_eq!(pool.max_workers(), 4);
        pool.mark_degraded();
        assert_eq!(pool.max_workers(), 1);
        assert!(pool.is_degraded());
    }

    #[test]
    fn acquire_without_loaded_model_reports_an_error() {
        let mut pool = SonaPool::new();
        assert!(pool.plan_acquire().is_err());
    }

    #[test]
    fn acquire_grows_when_no_worker_exists() {
        let mut pool = pool_with_model(2);
        assert!(matches!(pool.plan_acquire().unwrap(), AcquireStep::Grow));
    }

    #[test]
    fn a_single_worker_pool_cannot_wait_for_a_release() {
        let mut pool = pool_with_model(1);
        // One worker is allowed, but none exists yet, so the pool grows first.
        assert!(matches!(pool.plan_acquire().unwrap(), AcquireStep::Grow));
        assert_eq!(pool.max_workers(), 1);
    }

    #[test]
    fn upgrading_restores_the_requested_size() {
        let mut pool = pool_with_model(4);
        pool.mark_degraded();
        pool.mark_upgraded(3);
        assert_eq!(pool.max_workers(), 3);
        assert!(!pool.is_degraded());
    }
}
