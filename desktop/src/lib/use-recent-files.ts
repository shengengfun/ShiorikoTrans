import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { findMissingRecents, recentFileExists, sortRecents } from '~/lib/recent-files'
import {
	clearTranscriptSnapshots,
	deleteTranscriptSnapshot,
	listTranscriptSnapshots,
	loadTranscriptSnapshot,
	type TranscriptSummary,
} from '~/lib/transcript-store'
import { useFilesContext } from '~/providers/files-provider'
import { usePreferenceProvider, type RecentFile } from '~/providers/preference'
import { useTranscriptionProvider } from '~/providers/transcription'

/**
 * Shared "recent files" behaviour for the title bar dropdown and the settings
 * page.
 *
 * A recent entry is more than a path: the transcript itself is stored next to it
 * (`lib/transcript-store.ts`), so reopening restores the text instead of asking
 * for another transcription run. Entries whose source file disappeared can still
 * be opened as long as a transcript was saved.
 */
export function useRecentFiles() {
	const preference = usePreferenceProvider()
	const { openFiles, setFiles } = useFilesContext()
	const { restoreTranscript, loading } = useTranscriptionProvider()
	const navigate = useNavigate()
	const location = useLocation()
	const [missing, setMissing] = useState<Set<string>>(() => new Set())
	const [transcripts, setTranscripts] = useState<Record<string, TranscriptSummary>>({})
	const [busy, setBusy] = useState(false)

	const recent = useMemo(() => sortRecents(preference.recentFiles ?? []), [preference.recentFiles])

	const refreshTranscripts = useCallback(async () => {
		setTranscripts(await listTranscriptSnapshots())
	}, [])

	// Re-check whenever the list changes: a temp recording disappears on the next
	// launch, and a user file may have been moved or renamed meanwhile.
	useEffect(() => {
		let cancelled = false
		if (recent.length === 0) {
			setMissing(new Set())
			setTranscripts({})
			return
		}
		findMissingRecents(recent).then((result) => {
			if (!cancelled) setMissing(result)
		})
		listTranscriptSnapshots().then((result) => {
			if (!cancelled) setTranscripts(result)
		})
		return () => {
			cancelled = true
		}
	}, [recent])

	const remove = useCallback(
		(path: string) => {
			preference.setRecentFiles((previous) => (previous ?? []).filter((file) => file.path !== path))
			void deleteTranscriptSnapshot(path).then(refreshTranscripts)
		},
		[preference, refreshTranscripts],
	)

	const clear = useCallback(() => {
		preference.setRecentFiles([])
		void clearTranscriptSnapshots().then(refreshTranscripts)
	}, [preference, refreshTranscripts])

	/** Drop entries whose file is gone *and* which have no saved transcript. */
	const prune = useCallback(async () => {
		const dead = await findMissingRecents(preference.recentFiles ?? [])
		if (dead.size === 0) return 0
		const stored = await listTranscriptSnapshots()
		const removable = new Set([...dead].filter((path) => !stored[path]))
		if (removable.size === 0) return 0
		preference.setRecentFiles((previous) => (previous ?? []).filter((file) => !removable.has(file.path)))
		for (const path of removable) await deleteTranscriptSnapshot(path)
		setMissing(dead)
		await refreshTranscripts()
		return removable.size
	}, [preference, refreshTranscripts])

	const reveal = useCallback(async (file: RecentFile) => {
		try {
			await invoke('open_path', { path: file.path })
		} catch (error) {
			console.error('failed to reveal recent file:', error)
			toast.error(String(error))
		}
	}, [])

	/**
	 * Reopen a recent entry: restores the stored transcript when there is one and
	 * re-selects the source file only when it still exists.
	 */
	const open = useCallback(
		async (file: RecentFile) => {
			// Restoring would replace the segments of the running session.
			if (loading) {
				toast.warning(m.recentBusyTranscribing())
				return false
			}
			setBusy(true)
			try {
				const [snapshot, exists] = await Promise.all([loadTranscriptSnapshot(file.path), recentFileExists(file.path)])

				if (!snapshot && !exists) {
					setMissing((previous) => new Set(previous).add(file.path))
					toast.error(m.recentFileMissing({ name: file.name }), {
						description: file.path,
						action: { label: m.remove(), onClick: () => remove(file.path) },
					})
					return false
				}

				preference.setHomeTab('file')
				if (snapshot) {
					restoreTranscript(snapshot)
					await refreshTranscripts()
				}
				if (exists) {
					// `openFiles` survives the destination page's own "reset on
					// navigation" effect, so no timeout hacks are needed here.
					openFiles([{ name: file.name, path: file.path }])
				} else {
					// Transcript without its source: show the text but keep the picker
					// empty so a re-run cannot target a file that no longer exists.
					setFiles([])
					toast.warning(m.recentSourceMissingRestored(), { description: file.path })
				}
				if (location.pathname !== '/') navigate('/')
				return true
			} finally {
				setBusy(false)
			}
		},
		[loading, location.pathname, navigate, openFiles, preference, refreshTranscripts, remove, restoreTranscript, setFiles],
	)

	return { recent, missing, transcripts, busy, open, remove, clear, prune, reveal }
}
