import { invoke } from '@tauri-apps/api/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { useLocation, useNavigate } from 'react-router-dom'
import { TextFormat, formatExtensions } from '~/components/format-select'
import { Segment, Transcript, asCsv, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { isUserError } from '~/lib/sona-errors'
import { NamedPath } from '~/lib/types'
import { pathToNamedPath } from '~/lib/fs'
import { validPath } from '~/lib/media'
import { startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import { prepareTranscribeOptions, allowsChunking } from '~/lib/transcribe-options'
import { getModelPipelineFromPath } from '~/lib/model-pipeline'
import { planWorkers, type WorkerPlan } from '~/lib/hardware'
import * as config from '~/lib/config'
import { setActivity } from '~/lib/activity'
import { analyticsEvents, trackAnalyticsEvent } from '~/lib/analytics'
import successSound from '~/assets/success.mp3'
import * as fs from '@tauri-apps/plugin-fs'
import { emit, listen } from '@tauri-apps/api/event'
import { usePreferenceProvider } from '~/providers/preference'
import { useFilesContext } from '~/providers/files-provider'
import type { ProgressEvent } from '~/providers/transcription'
import { basename } from '@tauri-apps/api/path'
import { Claude, Ollama, Llm, OpenAICompatible } from '~/lib/llm'
import * as transcript from '~/lib/transcript'
import { path } from '@tauri-apps/api'
import { toast } from 'sonner'

const BATCH_JOB_PREFIX = 'batch-'

/** Per-file state shown in the queue while a batch runs. */
export interface BatchFileState {
	status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
	progress: number
}

type FileOutcome = 'done' | 'failed' | 'stop'

export function viewModel() {
	const { files, setFiles } = useFilesContext()

	const [formats, setFormats] = useState<TextFormat[]>(['normal'])
	const [completedCount, setCompletedCount] = useState(0)
	const [fileStates, setFileStates] = useState<Record<number, BatchFileState>>({})
	const [concurrency, setConcurrency] = useState(1)
	const [inProgress, setInProgress] = useState(false)
	const [isAborting, setIsAborting] = useState(false)
	const isAbortingRef = useRef<boolean>(false)
	const preference = usePreferenceProvider()
	const navigate = useNavigate()
	const [llm, setLlm] = useState<Llm | null>(null)
	const location = useLocation()
	const [outputFolder, setOutputFolder] = useState('')

	/** Mean progress of the files running right now, for the status bar. */
	const progress = useMemo(() => {
		const running = Object.values(fileStates).filter((state) => state.status === 'running')
		if (!running.length) return 0
		return Math.round(running.reduce((sum, state) => sum + state.progress, 0) / running.length)
	}, [fileStates])

	useEffect(() => {
		if (preference.llmConfig?.platform === 'ollama') {
			const llmInstance = new Ollama(preference.llmConfig)
			setLlm(llmInstance)
		} else if (preference.llmConfig?.platform === 'openai') {
			const llmInstance = new OpenAICompatible(preference.llmConfig)
			setLlm(llmInstance)
		} else {
			const llmInstance = new Claude(preference.llmConfig)
			setLlm(llmInstance)
		}
	}, [preference.llmConfig])

	const speakerLabel = preference.speakerLabels ? m.speakerPrefix() : null
	function getText(segments: Segment[], format: TextFormat) {
		if (format === 'srt') {
			return asSrt(segments, speakerLabel)
		}
		if (format === 'vtt') {
			return asVtt(segments, speakerLabel)
		}
		if (format === 'json') {
			return asJson(segments)
		}
		if (format === 'csv') {
			return asCsv(segments)
		}
		return asText(segments, speakerLabel)
	}

	async function checkFilesState() {
		if (location?.state?.files) {
			const newFiles: NamedPath[] = []
			for (const path of location.state.files) {
				if (!validPath(path)) continue
				const name = await basename(path)
				newFiles.push({ name, path })
			}
			setFiles(newFiles)
		}
	}

	async function checkOutputFolderState() {
		if (location.state?.outputFolder && !outputFolder) {
			if (await fs.exists(location.state?.outputFolder)) {
				setOutputFolder(location.state?.outputFolder)
			}
		}
	}

	useEffect(() => {
		checkOutputFolderState()
	}, [])

	useEffect(() => {
		checkFilesState()
	}, [])

	async function selectFiles() {
		const selected = await dialog.open({
			multiple: true,
			filters: [
				{
					name: 'Audio',
					extensions: [...config.audioExtensions, ...config.videoExtensions],
				},
			],
		})
		if (selected) {
			const newFiles: NamedPath[] = []
			for (const path of selected) {
				if (!validPath(path)) continue
				const name = await basename(path)
				newFiles.push({ name, path })
			}
			setFiles(newFiles)

			if (newFiles.length === 1) {
				navigate('/', { state: { files: newFiles } })
			}
		}
	}

	async function handleDrop() {
		listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
			const newFiles: NamedPath[] = []
			for (const path of event.payload.paths) {
				const file = await pathToNamedPath(path)
				newFiles.push({ name: file.name, path: file.path })
			}
			setFiles([
				...newFiles.filter((f) => {
					const path = f.path.toLowerCase()
					return (
						config.videoExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
						config.audioExtensions.some((ext) => path.endsWith(ext.toLowerCase())) ||
						files.includes(f)
					)
				}),
			])

			if (newFiles.length === 1) {
				navigate('/', { state: { files: newFiles } })
			}
		})
	}

	async function start() {
		if (inProgress) {
			return
		}

		const avx2 = await invoke<boolean>('is_avx2_enabled')
		if (!avx2) {
			trackAnalyticsEvent(analyticsEvents.AVX2_NOT_SUPPORTED)
			await dialog.message(m.avx2NotSupported(), { kind: 'error' })
			return
		}

		setInProgress(true)
		setIsAborting(false)

		startKeepAwake()

		if (!preference.modelPath) {
			setInProgress(false)
			stopKeepAwake()
			throw new Error('No model selected. Please download or select a model first.')
		}
		const modelPath = preference.modelPath
		const pipeline = getModelPipelineFromPath(modelPath)
		const allowChunking = allowsChunking(pipeline, {
			enabled: preference.highPerformanceMode && preference.chunkLongFiles,
			diarizeEnabled: preference.diarizeEnabled,
		})

		// How many files may run at once. The hardware decides unless the user
		// picked a fixed worker count.
		let plan: WorkerPlan
		try {
			plan = await planWorkers({
				modelPath,
				forceCpu: preference.forceCpu,
				highPerformance: preference.highPerformanceMode,
				overrideWorkers: preference.parallelWorkers,
			})
		} catch (error) {
			console.error('failed to size the worker pool:', error)
			plan = { workers: 1, profile: null as never, hardware: null as never }
		}
		const parallel = Math.max(1, Math.min(plan.workers, files.length))
		setConcurrency(parallel)

		const loadResult = await invoke<string>('load_model', {
			modelPath,
			gpuDevice: preference.gpuDevice,
			unloadTimeoutMinutes: preference.unloadTimeoutMinutes,
			maxWorkers: plan.workers,
			highPerformance: preference.highPerformanceMode,
		})
		if (loadResult === 'gpu_fallback') {
			toast.warning(m.gpuFallbackToCpu(), { position: 'bottom-center', duration: 8000 })
		}

		setFileStates(Object.fromEntries(files.map((_, index) => [index, { status: 'pending' as const, progress: 0 }])))
		setCompletedCount(0)

		let nextIndex = 0
		let stopRequested = false

		/**
		 * Runs one file to completion. Several of these run at once, each on its
		 * own inference worker, so the shared state is updated by index.
		 */
		async function processFile(index: number): Promise<FileOutcome> {
			const file = files[index]
			const jobId = `${BATCH_JOB_PREFIX}${index}`
			try {
				// Engine-aware options: only pass what the selected model supports and
				// attach the helper models it needs (VAD is downloaded on demand).
				const { options } = await prepareTranscribeOptions({
					path: file.path,
					modelPath,
					modelMetadata: preference.modelMetadata,
					modelOptions: preference.modelOptions,
					diarizeEnabled: preference.diarizeEnabled,
					stableTimestampsEnabled: preference.stableTimestampsEnabled,
					jobId,
					maxWorkers: parallel,
					allowChunking,
					autoThreads: preference.autoThreads,
				})
				const startTime = performance.now()
				setFileStates((prev) => ({ ...prev, [index]: { status: 'running', progress: 0 } }))

				// Check if exists
				const someFormat = formatExtensions[formats[0]]
				const ext = await path.extname(file.path)
				let dst = file.path.slice(0, -ext.length - 1) + someFormat
				const baseName = await path.basename(dst)
				if (!preference.advancedTranscribeOptions.saveNextToAudioFile && outputFolder) {
					dst = await path.join(outputFolder, baseName)
				}
				file.path = dst

				if (preference.advancedTranscribeOptions.skipIfExists && !outputFolder && (await fs.exists(dst))) {
					// ^ We can't know if it's not next to the audio file, multiple files can have the same names
					setFileStates((prev) => ({ ...prev, [index]: { status: 'skipped', progress: 100 } }))
					setCompletedCount((count) => count + 1)
					return 'done'
				}

				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, {
					source: 'batch',
				})
				const res: Transcript = await invoke('transcribe', {
					options,
				})

				if (isAbortingRef.current) {
					return 'done'
				}

				// Calculate time
				let total = Math.round((performance.now() - startTime) / 1000)
				console.info(`Transcribe ${file.name} took ${total} seconds.`)
				trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, {
					source: 'batch',
					duration_seconds: total,
					segments_count: res.segments.length,
				})

				let llmSegments: Segment[] | null = null
				if (llm && preference.llmConfig?.enabled) {
					try {
						const question = `${preference.llmConfig.prompt.replace('%s', transcript.asText(res.segments, speakerLabel))}`
						const answer = await llm.ask(question)
						if (answer) {
							llmSegments = [{ start: 0, stop: res.segments?.[res.segments?.length - 1].stop ?? 0, text: answer }]
						}
					} catch (e) {
						toast.error(String(e))
						console.error(e)
					}
				}

				for (const format of formats) {
					const dst = await invoke<string>('get_path_dst', { src: file.path, suffix: formatExtensions[format] })
					// Write file
					if (format === 'docx') {
						const fileName = await path.basename(dst)
						const { toDocx } = await import('~/lib/docx')
						const doc = await toDocx(fileName, res.segments, preference.textAreaDirection, speakerLabel)
						const arrayBuffer = await doc.arrayBuffer()
						const buffer = new Uint8Array(arrayBuffer)
						fs.writeFile(dst, buffer)
					} else {
						await fs.writeTextFile(dst, getText(res.segments, format))
					}
				}
				if (llmSegments) {
					const summaryPath = await invoke<string>('get_path_dst', { src: file.path, suffix: '.summary.txt' })
					await fs.writeTextFile(summaryPath, getText(llmSegments, 'srt'))
				}
				setFileStates((prev) => ({ ...prev, [index]: { status: 'done', progress: 100 } }))
				setCompletedCount((count) => count + 1)
				return 'done'
			} catch (error) {
				const errorObj = typeof error === 'object' && error !== null ? (error as any) : null
				const errorCode = errorObj?.code
				const errorMessage = errorObj?.message || String(error)

				// Check if this is a user error
				if (errorCode && isUserError(errorCode)) {
					// User error: show toast, skip analytics
					toast.error(`${m.error()}: ${errorMessage}`)
					console.error(`skipping file ${file.name} due to user error: `, error)
				} else {
					// Internal error: track analytics
					trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, {
						source: 'batch',
						error_message: errorMessage,
						file_ext: file.name.split('.').pop() ?? 'unknown',
					})
					if (isAbortingRef.current) {
						return 'done'
					}
					console.error(`error while transcribe ${file.name}: `, error)

					// Stop batch if model is not loaded — all subsequent files will fail too
					if (String(error).includes('no model loaded')) {
						toast.error(m.noModelLoadedBatchStopped())
						setFileStates((prev) => ({ ...prev, [index]: { status: 'failed', progress: 0 } }))
						setCompletedCount((count) => count + 1)
						return 'stop'
					}
				}

				setFileStates((prev) => ({ ...prev, [index]: { status: 'failed', progress: 0 } }))
				setCompletedCount((count) => count + 1)
				return 'failed'
			}
		}

		// Simple worker pool: every runner pulls the next file until the queue is
		// empty, so one slow file never blocks the others.
		const runners = Array.from({ length: parallel }, async () => {
			while (!isAbortingRef.current && !stopRequested) {
				const index = nextIndex
				nextIndex += 1
				if (index >= files.length) return
				const outcome = await processFile(index)
				if (outcome === 'stop') {
					stopRequested = true
					return
				}
			}
		})
		await Promise.all(runners)

		stopKeepAwake()
		setInProgress(false)
		setIsAborting(false)
		// Focus back the window and play sound
		if (preference!.soundOnFinish) {
			new Audio(successSound).play()
		}
		if (preference!.focusOnFinish) {
			webview.getCurrentWebviewWindow().unminimize()
			webview.getCurrentWebviewWindow().setFocus()
		}
		console.info(`Batch finished: ${completedCount} of ${files.length} files processed`)
	}

	async function ListenForProgress() {
		await listen<ProgressEvent>('transcribe_progress', (event) => {
			const jobId = event.payload?.jobId
			if (!jobId || !jobId.startsWith(BATCH_JOB_PREFIX)) return
			const index = Number(jobId.slice(BATCH_JOB_PREFIX.length))
			if (!Number.isInteger(index)) return
			const value = Math.round(event.payload.progress)
			if (value < 0 || value > 100) return
			setFileStates((prev) => {
				const current = prev[index]
				if (!current || current.progress === value) return prev
				return { ...prev, [index]: { ...current, progress: value } }
			})
		})
	}

	useEffect(() => {
		handleDrop()
		ListenForProgress()
	}, [])

	// Publish global activity for the bottom status bar
	useEffect(() => {
		setActivity(inProgress ? { phase: 'transcribing', progress } : { phase: 'idle' })
	}, [inProgress, progress])

	async function cancel() {
		if (isAbortingRef.current) {
			return
		}
		isAbortingRef.current = true

		emit('abort_transcribe')
		setIsAborting(true)
		setInProgress(false)
	}

	return {
		selectFiles,
		isAborting,
		inProgress,
		setInProgress,
		progress,
		fileStates,
		completedCount,
		concurrency,
		cancel,
		start,
		files,
		formats,
		setFormats,
		preference: preference,
	}
}
