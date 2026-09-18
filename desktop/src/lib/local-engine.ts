import * as fsExt from '@tauri-apps/plugin-fs'
import * as pathExt from '@tauri-apps/api/path'
import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { m } from '~/paraglide/messages.js'
import type { LlmConfig } from './llm'
import { baseUrlForPort, ensureLlamaServer, getLlamaStatus, installLlamaServer, portFromBaseUrl, startLlamaServer, stopLlamaServer } from './llama-server'
import type { LlamaStatus } from './llama-server'
import { LOCAL_MODELS, translateModelsDir } from './translate-models'

/**
 * Shared plumbing for the two features that run a model on this machine:
 * translation and summarisation. Both talk to an OpenAI-compatible server, so
 * both can use the llama.cpp runtime the app downloads and starts itself.
 */
export { baseUrlForPort, getLlamaStatus, installLlamaServer, portFromBaseUrl, startLlamaServer, stopLlamaServer }
export type { LlamaStatus }

/** True when the URL points at this machine. */
export function isLocalUrl(url: string | null | undefined): boolean {
	return /127\.0\.0\.1|localhost|\[::1\]/.test(url ?? '')
}

export interface LocalModelFile {
	filename: string
	path: string
	sizeMB: number
}

/**
 * Is anything answering on this OpenAI-compatible endpoint? A 401/404 still
 * proves a server is up, so only transport failures and 5xx count as down.
 */
export async function probeEndpoint(url: string, apiKey?: string, timeoutMs = 2500): Promise<boolean> {
	if (!url) return false
	try {
		const controller = new AbortController()
		const timer = window.setTimeout(() => controller.abort(), timeoutMs)
		try {
			const response = await httpFetch(`${url.replace(/\/+$/, '')}/models`, {
				signal: controller.signal,
				headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
			})
			return response.status < 500
		} finally {
			window.clearTimeout(timer)
		}
	} catch (error) {
		console.error('endpoint probe failed:', error)
		return false
	}
}

/** Every GGUF already present in the shared local model folder. */
export async function listLocalModels(): Promise<LocalModelFile[]> {
	try {
		const dir = await translateModelsDir()
		const entries = await fsExt.readDir(dir)
		const files: LocalModelFile[] = []
		for (const entry of entries) {
			if (!entry.name.toLowerCase().endsWith('.gguf')) continue
			const path = await pathExt.join(dir, entry.name)
			let sizeMB = 0
			try {
				const info = await fsExt.stat(path)
				sizeMB = Math.round((info.size ?? 0) / (1024 * 1024))
			} catch {
				/* size is only cosmetic */
			}
			files.push({ filename: entry.name, path, sizeMB })
		}
		return files.sort((a, b) => a.filename.localeCompare(b.filename))
	} catch (error) {
		console.error('failed to list local models:', error)
		return []
	}
}

/**
 * Absolute path of the configured model. The value is normally a bare file name
 * from the catalogue, but a full path the user picked by hand is accepted too.
 */
export async function resolveLocalModel(model: string | undefined): Promise<string | null> {
	const name = (model ?? '').trim()
	if (!name) return null
	try {
		const candidate = /[\\/]/.test(name) ? name : await pathExt.join(await translateModelsDir(), name)
		return (await fsExt.exists(candidate)) ? candidate : null
	} catch (error) {
		console.error('failed to look up the local model:', error)
		return null
	}
}

/** Display name of a catalogue entry for a bare file name, when known. */
export function localModelLabel(filename: string): string {
	return LOCAL_MODELS.find((entry) => entry.filename === filename)?.name ?? filename
}

/**
 * Makes sure `model` is being served on the machine and returns the base URL to
 * talk to, so a configuration pointing at `http://127.0.0.1:8080/v1` works
 * without the user ever starting a server by hand.
 */
export async function ensureLocalModelServer(endpoint: string, model: string): Promise<string> {
	const path = await resolveLocalModel(model)
	if (!path) throw new Error(m.localModelMissing())
	try {
		return await ensureLlamaServer(path, portFromBaseUrl(endpoint))
	} catch (error) {
		console.error('failed to start the local engine:', error)
		throw new Error(m.localEngineStartFailed({ error: error instanceof Error ? error.message : String(error) }))
	}
}

/**
 * Starts the bundled engine when the configuration points at this machine and
 * nothing is listening yet. Hosted endpoints are left alone — they report their
 * own, more specific errors. `config.openaiBaseUrl` is updated in place when the
 * engine had to fall back to a different port.
 */
export async function ensureEngineRunning(config: LlmConfig): Promise<void> {
	if (config.platform !== 'openai' || !isLocalUrl(config.openaiBaseUrl)) return
	const endpoint = (config.openaiBaseUrl ?? '').replace(/\/+$/, '')
	if (await probeEndpoint(endpoint, config.openaiApiKey)) return
	const baseUrl = await ensureLocalModelServer(endpoint, config.model)
	if (baseUrl !== config.openaiBaseUrl) config.openaiBaseUrl = baseUrl
}
