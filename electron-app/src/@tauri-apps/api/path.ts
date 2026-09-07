// Compatibility shim: @tauri-apps/api/path
import { path as pathAdapter } from '~/lib/electron-adapter'

export async function basename(filePath: string): Promise<string> {
	return pathAdapter.basename(filePath)
}
export async function dirname(filePath: string): Promise<string> {
	return pathAdapter.dirname(filePath)
}
export async function extname(filePath: string): Promise<string> {
	return pathAdapter.extname(filePath)
}
export async function join(...paths: string[]): Promise<string> {
	return pathAdapter.join(...paths)
}
export async function resolveResource(resourcePath: string): Promise<string> {
	return pathAdapter.resolveResource(resourcePath)
}
export async function appLocalDataDir(): Promise<string> {
	// In Electron, app data is handled by main process
	// Return a sensible default for browser context
	return '/tmp/audire-data'
}
export async function appConfigDir(): Promise<string> {
	return '/tmp/audire-config'
}
export async function documentDir(): Promise<string> {
	return '/tmp/audire-documents'
}
