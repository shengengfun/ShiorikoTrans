// Compatibility shim: @tauri-apps/plugin-notification
import { invoke } from '~/lib/electron-adapter'

export async function requestPermission(): Promise<string> {
	return invoke('plugin:notification|request_permission') as Promise<string>
}

export async function isPermissionGranted(): Promise<boolean> {
	return invoke('plugin:notification|is_permission_granted') as Promise<boolean>
}

export async function sendNotification(options: { title: string; body: string }): Promise<void> {
	await invoke('plugin:notification|notify', { options })
}
