// Compatibility shim: @tauri-apps/plugin-process
export async function exit(code: number = 0): Promise<void> {
	window.close()
}

export async function relaunch(): Promise<void> {
	location.reload()
}
