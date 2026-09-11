import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import { ls } from '~/lib/fs'
import { findModelFilesInDir, getFriendlyModelName, isTranscriptionModelFile } from '~/lib/model'
import { isNonTranscribeSubdir } from '~/lib/model-paths'

export interface ModelEntry {
	/**
	 * Full model name: the folder name for directory-based models
	 * (`models/transcribe/<ModelName>/<file>.bin`), otherwise the file name.
	 */
	name: string
	path: string
	/** The actual model file, only set when the model lives in its own folder. */
	file?: string
	is_dir: boolean
}

/** Enumerate every transcription model (helper models like VAD/diarize are skipped). */
export async function loadTranscriptionModels(): Promise<ModelEntry[]> {
	try {
		const root = await invoke<string>('get_models_folder')
		const entries = await ls(root)
		const list: ModelEntry[] = []
		for (const entry of entries) {
			if (entry.is_dir) {
				if (isNonTranscribeSubdir(entry.name)) continue
				const files = await findModelFilesInDir(entry.path)
				for (const file of files) list.push({ name: entry.name, path: file.path, file: file.name, is_dir: true })
			} else if (isTranscriptionModelFile(entry.name)) {
				list.push({ name: entry.name, path: entry.path, is_dir: false })
			}
		}
		return list
	} catch (error) {
		console.error('failed to list models:', error)
		return []
	}
}

/** Model list for pickers/dialogs, refreshed when `refreshKey` changes. */
export function useTranscriptionModels(refreshKey?: unknown) {
	const [models, setModels] = useState<ModelEntry[]>([])

	const reload = useCallback(async () => {
		setModels(await loadTranscriptionModels())
	}, [])

	useEffect(() => {
		let cancelled = false
		loadTranscriptionModels().then((list) => {
			if (!cancelled) setModels(list)
		})
		return () => {
			cancelled = true
		}
	}, [reload, refreshKey])

	return { models, reload }
}

const GENERIC_FILENAMES = /^(ggml[-_])?model\.[a-z0-9]+$/i

/** Friendly name for a model entry: the folder name wins for folder-based models. */
export function friendlyModelName(entry: Pick<ModelEntry, 'name' | 'file' | 'is_dir'>) {
	if (entry.is_dir && entry.file && GENERIC_FILENAMES.test(entry.file)) return getFriendlyModelName(entry.name)
	return getFriendlyModelName(entry.file ?? entry.name)
}

/** Display name for a model entry (user rename > folder/file name). */
export function modelDisplayName(entry: ModelEntry, displayNames: Record<string, string>) {
	return displayNames[entry.path] ?? friendlyModelName(entry)
}

/** Best-effort display name when only a path is known (model list not loaded yet). */
export function modelNameFromPath(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean)
	const file = parts[parts.length - 1] ?? ''
	const parent = parts[parts.length - 2] ?? ''
	const parentIsBucket = !parent || parent === 'transcribe' || parent === 'models'
	if (!parentIsBucket && GENERIC_FILENAMES.test(file)) return getFriendlyModelName(parent)
	return getFriendlyModelName(file)
}
