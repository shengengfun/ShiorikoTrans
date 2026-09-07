// Compatibility shim: @tauri-apps/plugin-dialog
import { dialog as dialogAdapter } from '~/lib/electron-adapter'

export function open(options?: any): Promise<string | string[] | null> {
	return dialogAdapter.open(options)
}
export function save(options?: any): Promise<string | null> {
	return dialogAdapter.save(options)
}
export async function message(messageText: string, options?: any): Promise<void> {
	return dialogAdapter.message(messageText, options)
}
export async function ask(messageText: string, options?: any): Promise<boolean> {
	return dialogAdapter.ask(messageText, options)
}
