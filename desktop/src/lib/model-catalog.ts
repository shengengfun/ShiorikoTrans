import type { ModelType } from '~/lib/model-pipeline'

export interface CatalogFile {
	url: string
	filename: string
}

export interface CatalogModel {
	id: string
	/** Display name, e.g. `Whisper Large v3 Turbo`. */
	name: string
	engine: ModelType
	/** Quantization tag shown next to the name. */
	quantization?: string
	/** Approximate download size in MB (sum of all files). */
	sizeMB: number
	/** Number of supported languages (shown as "N languages"). */
	languageCount?: number
	/** Explicit language codes when the count alone would be misleading. */
	languageCodes?: string[]
	recommended?: boolean
	/** Engine needs the Silero VAD helper model (downloaded automatically). */
	requiresVad?: boolean
	/** Install into `models/transcribe/<folder>` instead of the transcribe root. */
	folder?: string
	files: CatalogFile[]
}

const HF = 'https://huggingface.co'
const whisperCpp = (file: string) => `${HF}/ggerganov/whisper.cpp/resolve/main/${file}`
const parakeetV3 = (file: string) => `${HF}/handy-computer/parakeet-tdt-0.6b-v3-gguf/resolve/main/${file}`
const nemotron = (file: string) => `${HF}/handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf/resolve/main/${file}`
const senseVoice = (file: string) => `${HF}/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/${file}`

/**
 * Curated, one-click installable transcription models.
 *
 * Every entry was checked against the engines sona actually implements:
 * Whisper (GGML), Parakeet / Nemotron (GGUF with `general.architecture=parakeet`)
 * and SenseVoice (CTC ONNX export + `tokens.txt`).
 */
export const MODEL_CATALOG: CatalogModel[] = [
	{
		id: 'parakeet-v3-q4',
		name: 'Parakeet TDT 0.6B v3',
		engine: 'parakeet',
		quantization: 'Q4_K_M',
		sizeMB: 463,
		languageCount: 25,
		recommended: true,
		requiresVad: true,
		files: [{ url: parakeetV3('parakeet-tdt-0.6b-v3-Q4_K_M.gguf'), filename: 'parakeet-tdt-0.6b-v3-Q4_K_M.gguf' }],
	},
	{
		id: 'nemotron-3.5-q4',
		name: 'Nemotron 3.5 ASR Streaming 0.6B',
		engine: 'nemotron',
		quantization: 'Q4_K_M',
		sizeMB: 473,
		languageCount: 32,
		recommended: true,
		requiresVad: true,
		files: [{ url: nemotron('nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf'), filename: 'nemotron-3.5-asr-streaming-0.6b-Q4_K_M.gguf' }],
	},
	{
		id: 'sensevoice-small',
		name: 'SenseVoice Small',
		engine: 'sensevoice',
		quantization: 'int8',
		sizeMB: 229,
		languageCodes: ['zh', 'en', 'ja', 'ko', 'yue'],
		folder: 'SenseVoiceSmall',
		files: [
			{ url: senseVoice('model.int8.onnx'), filename: 'model.int8.onnx' },
			{ url: senseVoice('tokens.txt'), filename: 'tokens.txt' },
		],
	},
	{
		id: 'whisper-large-v3-turbo-q5',
		name: 'Whisper Large v3 Turbo',
		engine: 'whisper',
		quantization: 'Q5_0',
		sizeMB: 547,
		languageCount: 99,
		recommended: true,
		files: [{ url: whisperCpp('ggml-large-v3-turbo-q5_0.bin'), filename: 'ggml-large-v3-turbo-q5_0.bin' }],
	},
	{
		id: 'whisper-large-v3-turbo',
		name: 'Whisper Large v3 Turbo',
		engine: 'whisper',
		quantization: 'F16',
		sizeMB: 1549,
		languageCount: 99,
		files: [{ url: whisperCpp('ggml-large-v3-turbo.bin'), filename: 'ggml-large-v3-turbo.bin' }],
	},
	{
		id: 'whisper-large-v3',
		name: 'Whisper Large v3',
		engine: 'whisper',
		quantization: 'F16',
		sizeMB: 2952,
		languageCount: 99,
		files: [{ url: whisperCpp('ggml-large-v3.bin'), filename: 'ggml-large-v3.bin' }],
	},
	{
		id: 'whisper-medium-q5',
		name: 'Whisper Medium',
		engine: 'whisper',
		quantization: 'Q5_0',
		sizeMB: 514,
		languageCount: 99,
		files: [{ url: whisperCpp('ggml-medium-q5_0.bin'), filename: 'ggml-medium-q5_0.bin' }],
	},
	{
		id: 'whisper-small-q5',
		name: 'Whisper Small',
		engine: 'whisper',
		quantization: 'Q5_1',
		sizeMB: 181,
		languageCount: 99,
		files: [{ url: whisperCpp('ggml-small-q5_1.bin'), filename: 'ggml-small-q5_1.bin' }],
	},
	{
		id: 'whisper-base-q5',
		name: 'Whisper Base',
		engine: 'whisper',
		quantization: 'Q5_1',
		sizeMB: 57,
		languageCount: 99,
		files: [{ url: whisperCpp('ggml-base-q5_1.bin'), filename: 'ggml-base-q5_1.bin' }],
	},
	{
		id: 'whisper-tiny-q5',
		name: 'Whisper Tiny',
		engine: 'whisper',
		quantization: 'Q5_1',
		sizeMB: 31,
		languageCount: 99,
		files: [{ url: whisperCpp('ggml-tiny-q5_1.bin'), filename: 'ggml-tiny-q5_1.bin' }],
	},
]

/** Helper model needed by Parakeet / Nemotron (and by stable timestamps). */
export const VAD_MODEL_FILE = 'ggml-silero-v6.2.0.bin'
