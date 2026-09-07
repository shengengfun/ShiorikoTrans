// Compatibility shim: @tauri-apps/plugin-fs
import { fs as fsAdapter } from '~/lib/electron-adapter'

export async function readTextFile(path: string): Promise<string> {
	return fsAdapter.readTextFile(path)
}
export async function writeTextFile(path: string, contents: string): Promise<void> {
	return fsAdapter.writeTextFile(path, contents)
}
export async function writeFile(path: string, contents: Uint8Array): Promise<void> {
	return fsAdapter.writeFile(path, contents)
}
export async function exists(path: string): Promise<boolean> {
	return fsAdapter.exists(path)
}
export async function readDir(path: string): Promise<{ name: string }[]> {
	return fsAdapter.readDir(path)
}
export async function remove(path: string): Promise<void> {
	return fsAdapter.remove(path)
}
export async function mkdir(_path: string): Promise<void> {
	// No-op in browser
}
export async function rename(_oldPath: string, _newPath: string): Promise<void> {
	// Not implemented
}
