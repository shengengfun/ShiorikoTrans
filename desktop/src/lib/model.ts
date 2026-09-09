import { invoke } from '@tauri-apps/api/core'
import * as pathExt from '@tauri-apps/api/path'
import * as fsExt from '@tauri-apps/plugin-fs'
import { transcriptionModelsDir } from './model-paths'

export const MODEL_EXTENSIONS = ['bin', 'gguf', 'onnx', 'pt', 'pth', 'safetensors', 'ckpt'] as const
export type ModelExtension = (typeof MODEL_EXTENSIONS)[number]

const MODEL_EXTENSION_PATTERN = new RegExp(`\\.(${MODEL_EXTENSIONS.join('|')})$`, 'i')

type DownloadModelResult = { status: 'completed'; path: string } | { status: 'cancelled' }

export function getModelExtension(filename: string): ModelExtension | null {
	const extension = filename.match(MODEL_EXTENSION_PATTERN)?.[1]?.toLowerCase()
	return MODEL_EXTENSIONS.includes(extension as ModelExtension) ? (extension as ModelExtension) : null
}

export function isGgufModel(filename: string) {
	return getModelExtension(filename) === 'gguf'
}

export function randomString(length: number, prefix: string, suffix: string) {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
	let result = prefix
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result + suffix
}

export async function getFilenameFromUrl(url: string) {
	const urlObj = new URL(url)
	const fileName = urlObj.pathname.split('/').pop() || ''
	return fileName
}

export function getFriendlyModelName(filename: string) {
	const name = filename.replace(MODEL_EXTENSION_PATTERN, '').replace(/^ggml[-_]?/, '')
	if (!name || name === 'model') return 'Custom model'
	return name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export async function downloadModel(url: string) {
	let filename = await getFilenameFromUrl(url)
	if (!isModelFile(filename)) {
		filename = 'ggml-model.bin'
	}
	const modelsFolder = await invoke<string>('get_models_folder')
	const modelsDir = await transcriptionModelsDir(modelsFolder)
	let modelPath = await pathExt.join(modelsDir, filename)
	if (await fsExt.exists(modelPath)) {
		filename = randomString(8, 'ggml-model_', `.${getModelExtension(filename) ?? 'bin'}`)
		modelPath = await pathExt.join(modelsDir, filename)
	}
	const result = await invoke<DownloadModelResult>('download_model', { url, path: modelPath })
	return result.status === 'completed' ? result.path : null
}

export function isModelFile(filename: string) {
	return getModelExtension(filename) !== null
}

/**
 * Helper (non-transcription) model filename markers — Silero VAD, speaker
 * diarization (sortformer / wespeaker / segmentation). These are auxiliary
 * models used by stable timestamps and diarization, not transcription models:
 * loading one as a Whisper model crashes sona with
 * `GGML_ASSERT(wtype != GGML_TYPE_COUNT)`.
 */
const HELPER_MODEL_MARKERS = ['silero', 'sortformer', 'wespeaker', 'diar', 'segmentation'] as const

/** True when `filename` is a model file usable for transcription, i.e. not a
 * VAD / diarization helper model. */
export function isTranscriptionModelFile(filename: string): boolean {
	if (!isModelFile(filename)) return false
	const lower = filename.toLowerCase()
	return !HELPER_MODEL_MARKERS.some((marker) => lower.includes(marker))
}

export async function findModelFilesInDir(dirPath: string): Promise<{ name: string; path: string }[]> {
	try {
		const entries = await fsExt.readDir(dirPath)
		const files: { name: string; path: string }[] = []
		for (const entry of entries) {
			if (!entry.isDirectory && isTranscriptionModelFile(entry.name)) {
				const fullPath = await pathExt.join(dirPath, entry.name)
				files.push({ name: entry.name, path: fullPath })
			}
		}
		files.sort((a, b) => {
			const aLower = a.name.toLowerCase()
			const bLower = b.name.toLowerCase()
			const aPriority = (aLower.includes('model') || aLower.includes('sensevoice')) ? 0 : 1
			const bPriority = (bLower.includes('model') || bLower.includes('sensevoice')) ? 0 : 1
			if (aPriority !== bPriority) return aPriority - bPriority
			return a.name.localeCompare(b.name)
		})
		return files
	} catch (e) {
		console.error('failed to find model files in dir:', e)
		return []
	}
}

export async function findModelFileInDir(dirPath: string): Promise<string | null> {
	const files = await findModelFilesInDir(dirPath)
	return files.length > 0 ? files[0].path : null
}

export interface ModelCapabilities {
	engine: 'whisper' | 'nemotron' | string
	requires_vad: boolean
	languages: string[]
	language_detection: boolean
	streaming: boolean
	translation: boolean
	timestamps: boolean
	text_prompts: boolean
}

export interface ModelMetadata {
	format: string
	capabilities: ModelCapabilities
}
