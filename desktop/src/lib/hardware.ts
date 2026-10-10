import { invoke } from '@tauri-apps/api/core'

/** One GPU the inference engine can use, with its memory when detectable. */
export interface GpuInfo {
	index: number
	name: string
	description: string
	deviceType: 'gpu' | 'igpu' | string
	vramBytes: number | null
	vramSource: string | null
}

export interface HardwareInfo {
	cpuBrand: string
	cpuPhysicalCores: number
	cpuLogicalCores: number
	totalRamBytes: number
	gpus: GpuInfo[]
	/** Device used when the GPU setting is left on "auto". */
	recommendedGpuDevice: number | null
	/** Thread count derived from the physical core count. */
	recommendedThreads: number
}

export type PerfReasonCode =
	| 'disabled'
	| 'cpuOnly'
	| 'parallel'
	| 'singleWorkerLowVram'
	| 'integratedGpu'
	| 'unknownVram'
	| 'memoryLimited'
	| 'gpuFallback'
	| 'overridden'

/** Why the profile came out the way it did (localised by the UI). */
export interface PerfReason {
	code: PerfReasonCode
	physicalCores?: number
	vramGb?: number
	modelGb?: number
	perWorkerGb?: number
	workers?: number
	ramGb?: number
}

export interface PerfProfile {
	/** Several inference processes may run at once. */
	parallel: boolean
	workers: number
	threads: number
	gpuDevice: number | null
	reason: PerfReason
}

export interface HardwareReport {
	hardware: HardwareInfo
	profile: PerfProfile
	modelSizeBytes: number
}

export interface HardwareQuery {
	modelPath?: string | null
	forceCpu?: boolean
	highPerformance?: boolean
	/** `null`/omitted means "size the pool from the hardware". */
	overrideWorkers?: number | null
}

const cache = new Map<string, Promise<HardwareReport>>()

/**
 * Hardware + runtime profile for the current settings.
 *
 * Detection spawns a helper process and queries the GPU, so results are cached
 * per query; `invalidateHardwareReport` clears the cache when the performance
 * settings change.
 */
export function hardwareReport(query: HardwareQuery = {}): Promise<HardwareReport> {
	const key = JSON.stringify(query)
	const cached = cache.get(key)
	if (cached) return cached
	const request = invoke<HardwareReport>('get_hardware_info', {
		modelPath: query.modelPath ?? null,
		forceCpu: query.forceCpu ?? false,
		highPerformance: query.highPerformance ?? true,
		overrideWorkers: query.overrideWorkers ?? null,
	}).catch((error) => {
		cache.delete(key)
		throw error
	})
	cache.set(key, request)
	return request
}

export function invalidateHardwareReport() {
	cache.clear()
}

export interface WorkerPlan {
	workers: number
	profile: PerfProfile
	hardware: HardwareInfo
}

/** Resolves how many inference workers a transcription may use right now. */
export async function planWorkers(input: {
	modelPath: string | null
	forceCpu: boolean
	highPerformance: boolean
	overrideWorkers: number | null
}): Promise<WorkerPlan> {
	const report = await hardwareReport({
		modelPath: input.modelPath,
		forceCpu: input.forceCpu,
		highPerformance: input.highPerformance,
		overrideWorkers: input.overrideWorkers,
	})
	return { workers: report.profile.workers, profile: report.profile, hardware: report.hardware }
}

export function formatBytes(bytes: number | null | undefined): string {
	if (!bytes || bytes <= 0) return '—'
	const gigabytes = bytes / 1024 ** 3
	if (gigabytes >= 1) return `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)} GB`
	return `${Math.round(bytes / 1024 ** 2)} MB`
}
