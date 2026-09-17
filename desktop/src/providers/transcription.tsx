import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { Dispatch, ReactNode, SetStateAction, createContext, useContext, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as transcript from '~/lib/transcript'
import { saveTranscriptSnapshot, type TranscriptSnapshot } from '~/lib/transcript-store'
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
	/** Name the session file when restoring a saved transcript. */
	setActiveFile: Dispatch<SetStateAction<{ name: string; path: string } | null>>
	/** Increments once per finished transcription run. */
	runId: number

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

	/** Replace the session with a transcript stored for a recent file. */
	restoreTranscript: (snapshot: TranscriptSnapshot) => void
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

	const {
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
		setActiveFile,
		runId,
	} = useTranscription({
			onResetSummary: () => {
				setSummarizeSegments(null)
				setTranscriptTab('transcript')
			},
			onSummarize: summarize,
		})

	/**
	 * Keep the transcript of the current session on disk (debounced) so the
	 * recent list can restore the text instead of asking for another run.
	 * Runs after the stream settles (`loading` false) and also picks up later
	 * edits, translations and summaries.
	 */
	useEffect(() => {
		if (loading) return
		if (!activeFile) return
		if (!segments?.length && !translatedSegments?.length && !summarizeSegments?.length) return
		const timer = window.setTimeout(() => {
			void saveTranscriptSnapshot({
				path: activeFile.path,
				name: activeFile.name,
				segments: segments ?? [],
				translatedSegments: translatedSegments ?? null,
				summary: summarizeSegments ?? null,
			})
		}, 1200)
		return () => window.clearTimeout(timer)
	}, [activeFile, loading, segments, translatedSegments, summarizeSegments])

	/** Load a stored transcript back into the session. */
	function restoreTranscript(snapshot: TranscriptSnapshot) {
		setActiveFile({ name: snapshot.name, path: snapshot.path })
		setSegments(snapshot.segments.length > 0 ? snapshot.segments : null)
		setTranslatedSegments(snapshot.translatedSegments?.length ? snapshot.translatedSegments : null)
		setSummarizeSegments(snapshot.summary?.length ? snapshot.summary : null)
		setTranscriptTab(snapshot.summary?.length ? 'summary' : 'transcript')
	}

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
				// The selection is kept across navigation now, so a plain update is enough.
				setFiles([{ name, path }])
				if (current.location.pathname !== '/') navigate('/')
				void latest.current.transcribe(path)
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
				setActiveFile,
				runId,
				summarizeSegments,
				setSummarizeSegments,
				summarizing,
				transcriptTab,
				setTranscriptTab,
				summarize,
				...recording,
				registerRecordFinishHook,
				restoreTranscript,
			}}>
			{children}
		</TranscriptionContext.Provider>
	)
}
