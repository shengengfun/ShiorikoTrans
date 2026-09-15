import { invoke } from '@tauri-apps/api/core'
import * as fsExt from '@tauri-apps/plugin-fs'
import * as pathExt from '@tauri-apps/api/path'
import { modelKindDir } from './model-paths'

/** A local translation model (GGUF, served by an OpenAI-compatible local server). */
export interface TranslateModelEntry {
	id: string
	name: string
	quantization: string
	sizeMB: number
	/** Short language coverage hint. */
	languages: string
	url: string
	filename: string
	recommended?: boolean
	/** Translation-specialised models beat general chat models on this task. */
	specialised?: boolean
}

/**
 * Curated small models that translate well on a local OpenAI-compatible server
 * (llama.cpp `llama-server`, LM Studio, Jan, vLLM…). All URLs are public.
 */
export const TRANSLATE_MODELS: TranslateModelEntry[] = [
	{
		id: 'hunyuan-mt-7b-q4',
		name: 'Hunyuan-MT-7B',
		quantization: 'Q4_K_M',
		sizeMB: 4410,
		languages: '38',
		url: 'https://huggingface.co/mradermacher/Hunyuan-MT-7B-GGUF/resolve/main/Hunyuan-MT-7B.Q4_K_M.gguf',
		filename: 'Hunyuan-MT-7B.Q4_K_M.gguf',
		recommended: true,
		specialised: true,
	},
	{
		id: 'hunyuan-mt-7b-q3',
		name: 'Hunyuan-MT-7B',
		quantization: 'Q3_K_M',
		sizeMB: 3617,
		languages: '38',
		url: 'https://huggingface.co/mradermacher/Hunyuan-MT-7B-GGUF/resolve/main/Hunyuan-MT-7B.Q3_K_M.gguf',
		filename: 'Hunyuan-MT-7B.Q3_K_M.gguf',
		specialised: true,
	},
	{
		id: 'qwen3-1.7b-q4',
		name: 'Qwen3 1.7B',
		quantization: 'Q4_K_M',
		sizeMB: 1056,
		languages: '100+',
		url: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf',
		filename: 'Qwen3-1.7B-Q4_K_M.gguf',
	},
	{
		id: 'qwen2.5-3b-q4',
		name: 'Qwen2.5 3B Instruct',
		quantization: 'Q4_K_M',
		sizeMB: 2007,
		languages: '29',
		url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
		filename: 'qwen2.5-3b-instruct-q4_k_m.gguf',
	},
	{
		id: 'qwen3-4b-q4',
		name: 'Qwen3 4B',
		quantization: 'Q4_K_M',
		sizeMB: 2382,
		languages: '100+',
		url: 'https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
		filename: 'Qwen3-4B-Q4_K_M.gguf',
	},
	{
		id: 'gemma-3-4b-q4',
		name: 'Gemma 3 4B IT',
		quantization: 'Q4_K_M',
		sizeMB: 2374,
		languages: '140',
		url: 'https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
		filename: 'gemma-3-4b-it-Q4_K_M.gguf',
	},
]

/** Presets for the local OpenAI-compatible servers people usually already run. */
export const LOCAL_SERVER_PRESETS = [
	{ id: 'llamacpp', label: 'llama.cpp (llama-server)', baseUrl: 'http://127.0.0.1:8080/v1', port: 8080 },
	{ id: 'lmstudio', label: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', port: 1234 },
	{ id: 'jan', label: 'Jan', baseUrl: 'http://127.0.0.1:1337/v1', port: 1337 },
	{ id: 'vllm', label: 'vLLM', baseUrl: 'http://127.0.0.1:8000/v1', port: 8000 },
] as const

export const DEFAULT_LOCAL_BASE_URL = LOCAL_SERVER_PRESETS[0].baseUrl

/** `models/translate` — where the downloaded translation models live. */
export async function translateModelsDir(): Promise<string> {
	const modelsFolder = await invoke<string>('get_models_folder')
	return modelKindDir(modelsFolder, 'translate')
}

export async function translateModelPath(filename: string): Promise<string> {
	return pathExt.join(await translateModelsDir(), filename)
}

export async function isTranslateModelInstalled(entry: TranslateModelEntry): Promise<boolean> {
	try {
		return await fsExt.exists(await translateModelPath(entry.filename))
	} catch (error) {
		console.error('failed to check translation model:', error)
		return false
	}
}

/** Downloads a translation model into `models/translate` (skips if present). */
export async function installTranslateModel(entry: TranslateModelEntry): Promise<string | null> {
	const target = await translateModelPath(entry.filename)
	if (await fsExt.exists(target)) return target
	const result = await invoke<{ status: 'completed' } | { status: 'cancelled' }>('download_model', { url: entry.url, path: target })
	return result.status === 'completed' ? target : null
}

/**
 * Command that serves a downloaded GGUF over the OpenAI-compatible API — the
 * app talks to it like any other endpoint, no Ollama required.
 */
export function llamaServerCommand(modelPath: string, port = 8080): string {
	return `llama-server -m "${modelPath}" --port ${port} --host 127.0.0.1`
}
