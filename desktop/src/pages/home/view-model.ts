import '@fontsource/roboto/400.css'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import * as dialog from '@tauri-apps/plugin-dialog'
import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { useLocation, useNavigate } from 'react-router-dom'
import { TextFormat } from '~/components/format-select'
import { NamedPath } from '~/lib/types'
import { ls, pathToNamedPath } from '~/lib/fs'
import { openPath } from '~/lib/app'
import { ModelOptions, usePreferenceProvider } from '~/providers/preference'
import { useTranscriptionProvider } from '~/providers/transcription'
import { useAudioDownload } from './hooks/use-audio-download'
import { useMediaSelection } from './hooks/use-media-selection'
import { isTranscriptionModelFile, findModelFilesInDir } from '~/lib/model'
import { isNonTranscribeSubdir } from '~/lib/model-paths'

export interface BatchOptions {
	files: NamedPath[]
	format: TextFormat
	modelOptions: ModelOptions
}

export function viewModel() {
	const location = useLocation()
	const [settingsVisible, setSettingsVisible] = useState(location.hash === '#settings')
	const navigate = useNavigate()

	// Transcription / summary / recording state lives in a provider above the
	// router, so switching pages (or opening settings) no longer discards a
	// running transcription.
	const session = useTranscriptionProvider()

	const {
		files, setFiles, audio, setAudio, selectedFolder, setSelectedFolder, isCollectingFolder,
		selectFiles, selectFolder, startFolderBatch, clearFolderSelection,
	} = useMediaSelection()
	const preference = usePreferenceProvider()
	const {
		cancelYtDlpRef, cancelYtDlpDownload, ytdlpProgress, setYtDlpProgress, switchToLinkTab,
		audioUrl, setAudioUrl, downloadAudio, downloadingAudio, setDownloadingAudio,
	} = useAudioDownload(session.transcribe)

	// Clear the folder selection when a recording finishes (the corresponding
	// listener now lives in the provider).
	useEffect(() => {
		session.registerRecordFinishHook(() => setSelectedFolder(null))
		return () => session.registerRecordFinishHook(null)
	}, [])


	async function checkIfCrashedRecently() {
		const isCrashed = await invoke<boolean>('is_crashed_recently')
		if (isCrashed) {
			dialog.message(m.crashedRecently())
			await invoke('rename_crash_file')
		}
	}


	useEffect(() => {
		checkIfCrashedRecently()
	}, [])



	// Transcription progress / segments and `record_finish` are handled by
	// TranscriptionProvider (they must survive page navigation); only
	// page-specific listeners stay here.
	function setupEventListeners(): () => void {
		const unlisteners: Promise<() => void>[] = []

		unlisteners.push(
			listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
				setSelectedFolder(null)
				const newFiles: NamedPath[] = []
				for (const path of event.payload.paths) {
					const file = await pathToNamedPath(path)
					newFiles.push({ name: file.name, path: file.path })
				}
				setFiles(newFiles)
				if (newFiles.length > 1) {
					navigate('/batch', { state: { files: newFiles.map((f) => f.path) } })
				}
			})
		)

		return () => unlisteners.forEach((p) => p.then((fn) => fn()))
	}



	async function checkModelExists() {
		try {
			const configPath = await invoke<string>('get_models_folder')
			const entries = await ls(configPath)
			const found: NamedPath[] = []
			for (const entry of entries) {
				if (entry.is_dir && isNonTranscribeSubdir(entry.name)) {
					continue
				}
				if (entry.is_dir) {
					const files = await findModelFilesInDir(entry.path)
					for (const f of files) {
						found.push({ name: entry.name, path: f.path, is_dir: true })
					}
				} else if (isTranscriptionModelFile(entry.name)) {
					found.push(entry)
				}
			}
			if (found.length === 0) {
				preference.setModelPath(null)
			} else {
				// Only keep the current selection if it's still a real
				// transcription model (e.g. not the Silero VAD helper model).
				const currentIsValid = preference.modelPath != null && found.some((f) => f.path === preference.modelPath)
				if (!currentIsValid) {
					preference.setModelPath(found[0].path)
				}
			}
		} catch (e) {
			console.error(e)
		}
	}

	useEffect(() => {
		let cleanup: (() => void) | undefined

		async function CheckCpuAndInit() {
			cleanup = setupEventListeners()
			checkModelExists()
		}

		CheckCpuAndInit()

		return () => {
			cleanup?.()
		}
	}, [])



	async function resummarize(prompt: string) {
		if (session.segments) await session.summarize(session.segments, prompt, true)
	}

	return {
		...session,
		cancelYtDlpRef,
		cancelYtDlpDownload,
		ytdlpProgress,
		setYtDlpProgress,
		preference: preference,
		openPath,
		selectFiles,
		selectFolder,
		startFolderBatch,
		clearFolderSelection,
		selectedFolder,
		setSelectedFolder,
		isCollectingFolder,
		settingsVisible,
		setSettingsVisible,
		audio,
		setAudio,
		files,
		setFiles,
		switchToLinkTab,
		audioUrl,
		setAudioUrl,
		downloadAudio,
		downloadingAudio,
		setDownloadingAudio,
		resummarize,
	}
}
