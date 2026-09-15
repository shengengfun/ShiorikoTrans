import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { m } from '~/paraglide/messages.js'

/** Where the ffmpeg binary the app is using comes from. */
export type FfmpegSource = 'bundled' | 'downloaded' | 'system'

export interface FfmpegStatus {
	found: boolean
	source?: FfmpegSource
	path?: string
	/** Size of the on-demand download, in MB. */
	downloadSizeMb: number
}

/**
 * ffmpeg is what decodes/merges audio before transcription. The full installer
 * bundles it; the slim one leaves it out (~83 MB) and downloads it on demand
 * into the app data folder, where the Rust lookup picks it up automatically.
 */
export async function getFfmpegStatus(): Promise<FfmpegStatus> {
	try {
		return await invoke<FfmpegStatus>('get_ffmpeg_status')
	} catch (error) {
		console.error('failed to read ffmpeg status:', error)
		return { found: false, downloadSizeMb: 83 }
	}
}

/** Downloads ffmpeg into the app data folder and returns its path. */
export async function installFfmpeg(): Promise<string> {
	return invoke<string>('install_ffmpeg')
}

/**
 * Makes sure ffmpeg is available before decoding a file, offering to download it
 * when the slim installer was used. Returns `false` when the user declines.
 */
export async function ensureFfmpegInstalled(
	withProgress: <T>(message: string, run: () => Promise<T>) => Promise<T>,
): Promise<boolean> {
	const status = await getFfmpegStatus()
	if (status.found) return true

	const confirmed = await ask(m.ffmpegRequired(), { title: 'ffmpeg', kind: 'warning' })
	if (!confirmed) return false
	await withProgress(m.downloadingFfmpeg() as string, () => installFfmpeg())
	return true
}
