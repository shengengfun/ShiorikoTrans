import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { toast } from 'sonner'
import { useLocalStorage } from 'usehooks-ts'
import { summarizeText } from '~/lib/summarize'
import * as transcript from '~/lib/transcript'
import { usePreferenceProvider } from '~/providers/preference'

/**
 * Summarisation state for the transcript page.
 *
 * The work itself lives in `lib/summarize` so the summary tab and the
transcription flow share one implementation, and so a long transcript is
chunked for a small local model instead of failing on one huge request.
 */
export function useSummarization() {
	const preference = usePreferenceProvider()
	const [segments, setSegments] = useState<transcript.Segment[] | null>(null)
	const [summarizing, setSummarizing] = useState(false)
	const [progress, setProgress] = useState<number | null>(null)
	const [transcriptTab, setTranscriptTab] = useLocalStorage<'transcript' | 'translated' | 'summary'>('prefs_transcript_tab', 'transcript')

	async function summarize(source: transcript.Segment[], prompt: string, showSummary = false) {
		if (!source.length) return
		const config = preference.llmConfig
		if (!config?.enabled) {
			toast.error(m.needEnableSummarize())
			return
		}
		setSummarizing(true)
		setProgress(0)
		try {
			const text = transcript.asText(source, preference.speakerLabels ? m.speakerPrefix() : null)
			const endpoint = config.openaiBaseUrl
			const answerPromise = summarizeText({
				text,
				prompt,
				config,
				chunkChars: preference.summarizeChunkChars,
				onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
			})
			toast.promise(answerPromise, {
				loading: m.summarizeLoading(),
				error: (error) => String(error),
				success: m.summarizeSuccess(),
			})
			const answer = await answerPromise
			// The engine may have picked another port; remember it so later runs do not
			// have to probe the old one first.
			if (config.openaiBaseUrl !== endpoint) preference.setLlmConfig({ ...config })
			if (answer) {
				setSegments([{ start: 0, stop: source[source.length - 1]?.stop ?? 0, text: answer }])
			}
			if (showSummary) setTranscriptTab('summary')
		} catch (error) {
			// `toast.promise` already surfaced the reason to the user.
			console.error(error)
		} finally {
			setSummarizing(false)
			setProgress(null)
		}
	}

	return {
		segments,
		setSegments,
		summarizing,
		progress,
		transcriptTab,
		setTranscriptTab,
		summarize,
	}
}
