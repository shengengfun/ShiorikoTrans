// Compatibility shim: @tauri-apps/plugin-clipboard-manager
import { clipboard as cb } from '~/lib/electron-adapter'

export async function writeText(text: string): Promise<void> {
	return cb.writeText(text)
}
export async function readText(): Promise<string> {
	try {
		return await navigator.clipboard.readText()
	} catch {
		return ''
	}
}
