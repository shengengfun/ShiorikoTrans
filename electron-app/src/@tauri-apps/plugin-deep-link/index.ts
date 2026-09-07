// Compatibility shim: @tauri-apps/plugin-deep-link
export async function onOpenUrl(callback: (urls: string[]) => void): Promise<() => void> {
	// Not implemented in Electron yet
	return () => {}
}

export async function getCurrentUrl(): Promise<string | null> {
	return null
}
