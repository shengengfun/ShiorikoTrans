// Compatibility shim: @tauri-apps/plugin-updater
// Updater is handled by Electron's autoUpdater in the main process
export async function check(): Promise<Update | null> {
	return null
}

export interface Update {
	version: string
	date?: string
	body?: string
	available?: boolean
	downloadAndInstall(onEvent?: (event: DownloadEvent) => void): Promise<void>
	close(): void
}

export type DownloadEvent = {
	event: 'Started' | 'Progress' | 'Finished'
	data?: any
}

