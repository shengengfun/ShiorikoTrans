import { event } from '@tauri-apps/api'
import { invoke } from '@tauri-apps/api/core'
import * as webview from '@tauri-apps/api/webviewWindow'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useContext, useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import successSound from '~/assets/success.mp3'
import { analyticsEvents, trackAnalyticsEvent } from '~/lib/analytics'
import { prepareTranscribeOptions } from '~/lib/transcribe-options'
import { setActivity } from '~/lib/activity'
import { ensureFfmpegInstalled } from '~/lib/ffmpeg'
import { useModelDownload } from '~/lib/model-download'
import { startKeepAwake, stopKeepAwake } from '~/lib/keep-awake'
import { isUserError } from '~/lib/sona-errors'
import * as transcript from '~/lib/transcript'
import { ErrorModalContext } from '~/providers/error-modal'
import { usePreferenceProvider } from '~/providers/preference'

interface UseTranscriptionOptions {
	onResetSummary: () => void
	onSummarize: (segments: transcript.Segment[], prompt: string) => Promise<void>
}

export function useTranscription({ onResetSummary, onSummarize }: UseTranscriptionOptions) {
	const preference = usePreferenceProvider()
	const preferenceRef = useRef(preference)
	const { withProgress } = useModelDownload()
	const { setState: setErrorModal } = useContext(ErrorModalContext)
	const abortRef = useRef(false)
	const [loading, setLoading] = useState(false)
	const [isAborting, setIsAborting] = useState(false)
	const [showForceAbort, setShowForceAbort] = useState(false)
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [translatedSegments, setTranslatedSegments] = useState<transcript.Segment[] | null>(null)
	const [progress, setProgress] = useState<number | null>(0)
	// Source of the running/last session, so the transcription page can restore
	// its selection after the user navigated away and back.
	const [activeFile, setActiveFile] = useState<{ name: string; path: string } | null>(null)

	useEffect(() => { preferenceRef.current = preference }, [preference])

	// Publish global activity for the bottom status bar
	useEffect(() => {
		if (loading) setActivity({ phase: 'transcribing', progress: progress ?? 0 })
	}, [loading, progress])

	useEffect(() => {
		if (!loading) setActivity({ phase: 'idle' })
	}, [loading])

	async function onAbort() {
		setIsAborting(true)
		setShowForceAbort(false)
		abortRef.current = true
		event.emit('abort_transcribe')
		window.setTimeout(() => {
			if (abortRef.current) {
				setShowForceAbort(true)
			}
		}, 2000)
	}

	function onForceAbort() {
		setIsAborting(false)
		setLoading(false)
		setProgress(null)
		setShowForceAbort(false)
		abortRef.current = false
		stopKeepAwake()
	}

	async function transcribe(path: string) {
		const avx2 = await invoke<boolean>('is_avx2_enabled')
		if (!avx2) {
			trackAnalyticsEvent(analyticsEvents.AVX2_NOT_SUPPORTED)
			await dialog.message(m.avx2NotSupported(), { kind: 'error' })
			return
		}

		// The slim installer does not ship ffmpeg (it is the biggest file in the
		// package), so offer to fetch it before the decode step needs it.
		if (!(await ensureFfmpegInstalled(withProgress))) return

		startKeepAwake()
		setActiveFile({ name: path.split(/[\\/]/).pop() || path, path })
		setSegments(null)
		setTranslatedSegments(null)
		onResetSummary()
		setLoading(true)
		abortRef.current = false
		let completedSegments: transcript.Segment[] = []
		trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_STARTED, { source: 'home' })

		try {
			const current = preferenceRef.current
			if (!current.modelPath) throw new Error('No model selected. Please download or select a model first.')
			const loadResult = await invoke<string>('load_model', {
				modelPath: current.modelPath,
				gpuDevice: current.gpuDevice,
				unloadTimeoutMinutes: current.unloadTimeoutMinutes,
			})
			if (loadResult === 'gpu_fallback') toast.warning(m.gpuFallbackToCpu(), { position: 'bottom-center', duration: 8000 })

			// Parakeet / Nemotron cannot run without the Silero VAD helper model, and
			// every engine must only receive the options it understands — both are
			// handled by the shared options builder (metadata is fetched on demand
			// when the model was switched from the title bar).
			const { options: baseOptions } = await prepareTranscribeOptions({
				path,
				modelPath: current.modelPath,
				modelMetadata: current.modelMetadata,
				modelOptions: current.modelOptions,
				diarizeEnabled: current.diarizeEnabled,
				stableTimestampsEnabled: current.stableTimestampsEnabled,
			})

			// Engines without translation never receive a translate target, so this is
			// only true for engines that actually support the extra pass.
			const needsTranslation = Boolean(baseOptions.translate) && baseOptions.translate !== 'none'

			const startedAt = performance.now()

			if (needsTranslation) {
				const originalOptions = { ...baseOptions, translate: 'none' }
				const originalResult = await invoke<transcript.Transcript>('transcribe', { options: originalOptions })
				completedSegments = originalResult.segments
				setSegments(originalResult.segments)

				const translatedOptions = { ...baseOptions }
				const translatedResultRaw = await invoke<transcript.Transcript>('transcribe', { options: translatedOptions })
				setTranslatedSegments(translatedResultRaw.segments)
			} else {
				const result = await invoke<transcript.Transcript>('transcribe', { options: baseOptions })
				completedSegments = result.segments
				setSegments(result.segments)
			}

			const total = Math.round((performance.now() - startedAt) / 1000)
			console.info(`Transcribe took ${total} seconds.`)
			toast.success(m.transcribeTook({ total: String(total) }), { position: 'bottom-center' })
			trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_SUCCEEDED, { source: 'home', duration_seconds: total, segments_count: completedSegments.length })
			preferenceRef.current.addRecentFile(path.split(/[\\/]/).pop() || path, path)
		} catch (error) {
			if (!abortRef.current) {
				stopKeepAwake()
				console.error('error: ', error)
				const errorObject = typeof error === 'object' && error !== null ? (error as { code?: string; message?: string }) : null
				const errorMessage = errorObject?.message || String(error)
				if (errorObject?.code && isUserError(errorObject.code)) {
					toast.error(`${m.error()}: ${errorMessage}`, { position: 'bottom-center' })
				} else {
					trackAnalyticsEvent(analyticsEvents.TRANSCRIBE_FAILED, { source: 'home', error_message: errorMessage, file_ext: path.split('.').pop() ?? 'unknown' })
					setErrorModal?.({ log: errorMessage, open: true })
				}
				setLoading(false)
			}
		} finally {
			stopKeepAwake()
			setLoading(false)
			setIsAborting(false)
			setShowForceAbort(false)
			setProgress(null)
			if (!abortRef.current) {
				if (preferenceRef.current.soundOnFinish) new Audio(successSound).play()
				if (preferenceRef.current.focusOnFinish) {
					webview.getCurrentWebviewWindow().unminimize()
					webview.getCurrentWebviewWindow().setFocus()
				}
			}
		}

		if (completedSegments.length > 0 && preferenceRef.current.llmConfig.enabled) {
			await onSummarize(completedSegments, preferenceRef.current.llmConfig.prompt)
		}
	}

	return { loading, isAborting, showForceAbort, segments, setSegments, translatedSegments, setTranslatedSegments, progress, setProgress, transcribe, onAbort, onForceAbort, activeFile }
}
