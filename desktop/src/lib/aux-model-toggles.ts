import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import * as config from '~/lib/config'
import { resolveAuxModelPath } from '~/lib/model-paths'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'

/**
 * Speaker diarization / stable-timestamps toggles. Both need an auxiliary model
 * (sortformer / Silero VAD) that is downloaded on demand, shared by the model
 * settings dialog.
 */
export function useAuxModelToggles() {
	const preference = usePreferenceProvider()
	const progressToast = useToastProvider()

	async function toggleDiarization(checked: boolean) {
		if (!checked) {
			preference.setDiarizeEnabled(false)
			return
		}
		try {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await resolveAuxModelPath(modelsFolder, 'diarize', config.diarizeModelFilename)
			const exists = await fs.exists(modelPath)
			if (exists) {
				preference.setDiarizeEnabled(true)
				// Labels are what diarization is for — show them right away.
				preference.setSpeakerLabels(true)
				return
			}
			const confirmed = await ask(m.downloadDiarizeModel(), { title: m.diarization(), kind: 'info' })
			if (confirmed) {
				progressToast.setMessage(m.downloadingDiarizeModel() as string)
				progressToast.setOpen(true)
				progressToast.setProgress(0)
				try {
					await invoke('download_model', { url: config.diarizeModelUrl, path: modelPath })
					preference.setDiarizeEnabled(true)
					preference.setSpeakerLabels(true)
					toast.success(m.downloadComplete())
				} finally {
					progressToast.setOpen(false)
					progressToast.setProgress(null)
				}
			}
		} catch (e) {
			console.error('diarization setup failed:', e)
			toast.error(String(e))
		}
	}

	async function handleStableTimestampsToggle(checked: boolean) {
		if (!checked) {
			preference.setStableTimestampsEnabled(false)
			return
		}
		try {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await resolveAuxModelPath(modelsFolder, 'vad', config.vadModelFilename)
			const exists = await fs.exists(modelPath)
			if (exists) {
				preference.setStableTimestampsEnabled(true)
			} else {
				const confirmed = await ask(m.stableTimestampsConfirm(), { title: m.stableTimestamps(), kind: 'info' })
				if (confirmed) {
					progressToast.setMessage(m.downloadingVadModel())
					progressToast.setOpen(true)
					progressToast.setProgress(0)
					try {
						await invoke('download_model', { url: config.vadModelUrl, path: modelPath })
						preference.setStableTimestampsEnabled(true)
						toast.success(m.downloadComplete())
					} finally {
						progressToast.setOpen(false)
						progressToast.setProgress(null)
					}
				}
			}
		} catch (e) {
			console.error('stable timestamps setup failed:', e)
			toast.error(String(e))
		}
	}

	return { toggleDiarization, handleStableTimestampsToggle }
}
