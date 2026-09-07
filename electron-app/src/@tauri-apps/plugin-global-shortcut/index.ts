// Compatibility shim: @tauri-apps/plugin-global-shortcut
import { globalShortcut as gs } from '~/lib/electron-adapter'

export async function register(shortcut: string, callback: (event: { state: 'Pressed' | 'Released' }) => void): Promise<void> {
	return gs.register(shortcut, callback)
}
export async function unregister(shortcut: string): Promise<void> {
	return gs.unregister(shortcut)
}
export async function isRegistered(shortcut: string): Promise<boolean> {
	return gs.isRegistered(shortcut)
}
