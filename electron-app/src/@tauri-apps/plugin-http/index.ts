// Compatibility shim: @tauri-apps/plugin-http
// Electron supports fetch natively, just re-export
export async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	return globalThis.fetch(input, init)
}

