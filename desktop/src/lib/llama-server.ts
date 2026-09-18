import { invoke } from '@tauri-apps/api/core'

/**
 * The built-in local translation engine.
 *
 * Translation with a local model used to require the user to install llama.cpp
 * and keep `llama-server` running by hand, which is why "local translation"
 * mostly ended in `error sending request for url (http://127.0.0.1:8080/...)`.
 * The app now owns that runtime: it downloads a llama.cpp build on demand and
 * starts/stops `llama-server` for the selected model.
 */
export interface LlamaStatus {
	installed: boolean
	path: string | null
	running: boolean
	port: number | null
	model: string | null
	/** Rough size of the runtime download in MB. */
	downloadSizeMb: number
}

export async function getLlamaStatus(): Promise<LlamaStatus> {
	return invoke<LlamaStatus>('get_llama_status')
}

/** Downloads the llama.cpp runtime once (progress is reported by the app). */
export async function installLlamaServer(): Promise<string> {
	return invoke<string>('install_llama_server')
}

/** Starts `llama-server` for a model file and returns the port it listens on. */
export async function startLlamaServer(modelPath: string, port?: number, threads?: number): Promise<number> {
	return invoke<number>('start_llama_server', { modelPath, port, threads })
}

export async function stopLlamaServer(): Promise<void> {
	await invoke('stop_llama_server')
}

/** Extracts the port from an OpenAI-compatible base URL (`...:8080/v1` → 8080). */
export function portFromBaseUrl(url: string | null | undefined): number | undefined {
	const match = /^https?:\/\/[^/]*?:(\d+)/.exec((url ?? '').trim())
	if (!match) return undefined
	const port = Number(match[1])
	return Number.isFinite(port) ? port : undefined
}

export function baseUrlForPort(port: number): string {
	return `http://127.0.0.1:${port}/v1`
}

/**
 * Makes sure a local OpenAI-compatible server is serving `modelPath`.
 *
 * Installs the runtime if needed and starts it on `preferredPort` when possible,
 * so a configuration pointing at `http://127.0.0.1:8080/v1` keeps working.
 * Returns the base URL callers should use.
 */
export async function ensureLlamaServer(modelPath: string, preferredPort?: number): Promise<string> {
	const status = await getLlamaStatus()
	if (status.running && status.model === modelPath && status.port) return baseUrlForPort(status.port)

	if (!status.installed) {
		// One-time ~70 MB download; the app shows the shared download progress.
		await installLlamaServer()
	}

	const port = await startLlamaServer(modelPath, preferredPort)
	return baseUrlForPort(port)
}
