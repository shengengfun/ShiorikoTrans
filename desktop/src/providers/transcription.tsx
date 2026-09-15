import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { Dispatch, ReactNode, SetStateAction, createContext, useContext, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as transcript from '~/lib/transcript'
import { useConfirmExit } from '~/lib/use-confirm-exit'
import { useRecording } from '~/pages/home/hooks/use-recording'
import { useSummarization } from '~/pages/home/hooks/use-summarization'
import { useTranscription } from '~/pages/home/hooks/use-transcription'
import { useFilesContext } from '~/providers/files-provider'
import { hotkeyRecordingActive } from '~/providers/hotkey'
import { usePreferenceProvider } from '~/providers/preference'

/**
 * App-wide transcription session.
 *
 * The transcription itself runs in the Rust backend, so the UI state for it
 * (progress, segments, summary, "is busy") must outlive the page that started
 * it. Keeping this in a provider mounted above the router means navigating to
 * another page (or the settings modal) no longer throws away the progress:
 * `transcribe_progress` / `new_segment` listeners stay registered and the
 * segments are still there when the user comes back to the transcription page.
 */
export interface TranscriptionProviderValue {
	// Transcription
	loading: boolean
	isAborting: boolean
	showForceAbort: boolean
	segments: transcript.Segment[] | null
	setSegments: Dispatch<SetStateAction<transcript.Segment[] | null>>
	translatedSegments: transcript.Segment[] | null
	setTranslatedSegments: Dispatch<SetStateAction<transcript.Segment[] | null>>
	progress: number | null
	setProgress: Dispatch<SetStateAction<number | null>>
	transcribe: (path: string) => Promise<void>
	onAbort: () => Promise<void>
	onForceAbort: () => void
	activeFile: { name: string; path: string } | null

	// Summary
	summarizeSegments: transcript.Segment[] | null
	setSummarizeSegments: Dispatch<SetStateAction<transcript.Segment[] | null>>
	summarizing: boolean
	transcriptTab: 'transcript' | 'translated' | 'summary'
	setTranscriptTab: (value: 'transcript' | 'translated' | 'summary') => void
	summarize: (source: transcript.Segment[], prompt: string, showSummary?: boolean) => Promise<void>

	// Recording
	devices: ReturnType<typeof useRecording>['devices']
	setDevices: ReturnType<typeof useRecording>['setDevices']
	inputDevice: ReturnType<typeof useRecording>['inputDevice']
	setInputDevice: ReturnType<typeof useRecording>['setInputDevice']
	outputDevice: ReturnType<typeof useRecording>['outputDevice']
	setOutputDevice: ReturnType<typeof useRecording>['setOutputDevice']
	isRecording: boolean
	setIsRecording: Dispatch<SetStateAction<boolean>>
	recordingName: string
	setRecordingName: Dispatch<SetStateAction<string>>
	startRecord: () => Promise<void>
	stopRecord: () => Promise<void>

	/** Page-specific cleanup to run when a recording finishes (e.g. clear the folder selection). */
	registerRecordFinishHook: (hook: (() => void) | null) => void
}

const TranscriptionContext = createContext<TranscriptionProviderValue | null>(null)

export function useTranscriptionProvider() {
	return useContext(TranscriptionContext) as TranscriptionProviderValue
}

export function TranscriptionProvider({ children }: { children: ReactNode }) {
	const navigate = useNavigate()
	const location = useLocation()
	const preference = usePreferenceProvider()
	const { setFiles } = useFilesContext()

	const { segments: summarizeSegments, setSegments: setSummarizeSegments, summarizing, transcriptTab, setTranscriptTab, summarize } = useSummarization()

	const { loading, isAborting, showForceAbort, segments, setSegments, translatedSegments, setTranslatedSegments, progress, setProgress, transcribe, onAbort, onForceAbort, activeFile } =
		useTranscription({
			onResetSummary: () => {
				setSummarizeSegments(null)
				setTranscriptTab('transcript')
			},
			onSummarize: summarize,
		})

	const recording = useRecording(() => {
		setSegments(null)
		setSummarizeSegments(null)
		setTranscriptTab('transcript')
	})

	useConfirmExit((segments?.length ?? 0) > 0 || loading)

	// Fresh references for the long-lived listeners below.
	const latest = useRef({ transcribe, preference, location, recording })
	useEffect(() => {
		latest.current = { transcribe, preference, location, recording }
	})

	const recordFinishHook = useRef<(() => void) | null>(null)
	function registerRecordFinishHook(hook: (() => void) | null) {
		recordFinishHook.current = hook
	}

	// Registered once for the app lifetime so progress keeps flowing even when
	// the transcription page is unmounted.
	useEffect(() => {
		const unlisteners: Promise<UnlistenFn>[] = []
		// Segments arrive one event at a time (hundreds for a long file). Applying
		// each event immediately re-renders the whole transcription subtree and used
		// to starve the UI thread — the window then ignored clicks (minimize/save).
		// Buffer them and flush in batches instead.
		const pending: transcript.Segment[] = []
		let flushTimer: number | null = null
		const flush = () => {
			flushTimer = null
			if (pending.length === 0) return
			const batch = pending.splice(0, pending.length)
			setSegments((prev) => (prev ? [...prev, ...batch] : batch))
		}
		const scheduleFlush = () => {
			if (flushTimer != null) return
			flushTimer = window.setTimeout(flush, 120)
		}

		unlisteners.push(
			listen('transcribe_progress', (event) => {
				const value = Math.round(event.payload as number)
				if (value < 0 || value > 100) return
				// Bail out when the percentage didn't change to avoid a re-render.
				setProgress((prev) => (prev === value ? prev : value))
			}),
		)
		unlisteners.push(
			listen<transcript.Segment>('new_segment', (event) => {
				pending.push(event.payload)
				scheduleFlush()
			}),
		)
		unlisteners.push(
			listen<{ path: string; name: string }>('record_finish', (event) => {
				if (hotkeyRecordingActive) return
				const { name, path } = event.payload
				const current = latest.current
				recordFinishHook.current?.()
				current.preference.setHomeTab('file')
				current.recording.setIsRecording(false)
				if (current.location.pathname !== '/') {
					navigate('/')
					// Let the transcription page's location effect finish clearing
					// the previous file selection first.
					window.setTimeout(() => {
						setFiles([{ name, path }])
						void latest.current.transcribe(path)
					}, 150)
				} else {
					setFiles([{ name, path }])
					void latest.current.transcribe(path)
				}
			}),
		)
		return () => {
			if (flushTimer != null) window.clearTimeout(flushTimer)
			unlisteners.forEach((promise) => promise.then((unlisten) => unlisten()))
		}
	}, [navigate, setFiles, setProgress, setSegments])

	return (
		<TranscriptionContext.Provider
			value={{
				loading,
				isAborting,
				showForceAbort,
				segments,
				setSegments,
				translatedSegments,
				setTranslatedSegments,
				progress,
				setProgress,
				transcribe,
				onAbort,
				onForceAbort,
				activeFile,
				summarizeSegments,
				setSummarizeSegments,
				summarizing,
				transcriptTab,
				setTranscriptTab,
				summarize,
				...recording,
				registerRecordFinishHook,
			}}>
			{children}
		</TranscriptionContext.Provider>
	)
}
