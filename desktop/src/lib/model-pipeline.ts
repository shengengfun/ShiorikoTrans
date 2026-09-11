export type ModelType = 'whisper' | 'nemotron' | 'sensevoice' | 'parakeet' | 'hunyuan' | 'custom'

export interface ModelPipeline {
	type: ModelType
	engine: string
	supportsGpu: boolean
	/** The engine cannot run at all without the Silero VAD helper model. */
	requiresVad: boolean
	/** VAD can be used for stable timestamps (separate from `requiresVad`). */
	supportsVad: boolean
	supportsDiarization: boolean
	supportsStreaming: boolean
	supportsTranslation: boolean
	supportsWordTimestamps: boolean
	/** Decoding parameters — engines reject options they don't understand, so
	 * every option passed to sona must be filtered through these flags. */
	supportsPrompt: boolean
	supportsTemperature: boolean
	supportsSampling: boolean
	supportsMaxTextCtx: boolean
	defaultThreads: number
	defaultTemperature: number
}

export const MODEL_PIPELINES: Record<ModelType, ModelPipeline> = {
	whisper: {
		type: 'whisper',
		engine: 'whisper',
		supportsGpu: true,
		requiresVad: false,
		supportsVad: true,
		supportsDiarization: true,
		supportsStreaming: true,
		supportsTranslation: true,
		supportsWordTimestamps: true,
		supportsPrompt: true,
		supportsTemperature: true,
		supportsSampling: true,
		supportsMaxTextCtx: true,
		defaultThreads: 4,
		defaultTemperature: 0.0,
	},
	nemotron: {
		type: 'nemotron',
		engine: 'nemotron',
		supportsGpu: true,
		requiresVad: true,
		supportsVad: false,
		supportsDiarization: true,
		supportsStreaming: true,
		supportsTranslation: false,
		supportsWordTimestamps: false,
		supportsPrompt: false,
		supportsTemperature: true,
		supportsSampling: false,
		supportsMaxTextCtx: false,
		defaultThreads: 4,
		defaultTemperature: 0.7,
	},
	parakeet: {
		type: 'parakeet',
		engine: 'parakeet',
		// NVIDIA Parakeet TDT / Nemotron RNNT GGUF (multilingual, needs Silero VAD).
		supportsGpu: true,
		requiresVad: true,
		supportsVad: false,
		supportsDiarization: false,
		supportsStreaming: true,
		supportsTranslation: false,
		supportsWordTimestamps: false,
		supportsPrompt: false,
		supportsTemperature: false,
		supportsSampling: false,
		supportsMaxTextCtx: false,
		defaultThreads: 4,
		defaultTemperature: 0.0,
	},
	sensevoice: {
		type: 'sensevoice',
		engine: 'sensevoice',
		// GPU via ONNX Runtime DirectML (D3D12); falls back to CPU automatically.
		supportsGpu: true,
		requiresVad: false,
		supportsVad: false,
		supportsDiarization: false,
		supportsStreaming: false,
		supportsTranslation: false,
		supportsWordTimestamps: false,
		supportsPrompt: false,
		supportsTemperature: false,
		supportsSampling: false,
		supportsMaxTextCtx: false,
		defaultThreads: 4,
		defaultTemperature: 0.0,
	},
	hunyuan: {
		type: 'hunyuan',
		engine: 'hunyuan',
		// Tencent Hunyuan-Audio: Qwen2-7B + whisper-large-v3 encoder + adapter.
		// Dedicated Rust engine not implemented yet; recognized for download/planning.
		supportsGpu: true,
		requiresVad: false,
		supportsVad: false,
		supportsDiarization: false,
		supportsStreaming: false,
		supportsTranslation: false,
		supportsWordTimestamps: false,
		supportsPrompt: false,
		supportsTemperature: false,
		supportsSampling: false,
		supportsMaxTextCtx: false,
		defaultThreads: 4,
		defaultTemperature: 0.0,
	},
	custom: {
		type: 'custom',
		engine: 'auto',
		supportsGpu: true,
		requiresVad: false,
		supportsVad: true,
		supportsDiarization: true,
		supportsStreaming: true,
		supportsTranslation: true,
		supportsWordTimestamps: true,
		supportsPrompt: true,
		supportsTemperature: true,
		supportsSampling: true,
		supportsMaxTextCtx: true,
		defaultThreads: 4,
		defaultTemperature: 0.0,
	},
}

// Whisper 关键词：包含 ggml- 前缀（whisper.cpp 默认命名）、版本代号、量化标记等
const WHISPER_KEYWORDS = [
	'whisper',
	'ggml-large', 'ggml-medium', 'ggml-small', 'ggml-base', 'ggml-tiny',
	'large-v3', 'large-v2', 'large-v1', 'large-turbo',
	'medium.en', 'small.en', 'base.en', 'tiny.en',
	'distil-whisper', 'distil-large', 'distil-medium', 'distil-small',
	'faster-whisper', 'deepgram', 'turbo-', 'q5_0', 'q5_1', 'q8_0',
]
const SENSEVOICE_KEYWORDS = ['sensevoice', 'sense-voice', 'sv-', 'funasr', 'paraformer']
const HUNYUAN_KEYWORDS = ['hunyuan', '混元']
const PARAKEET_KEYWORDS = ['parakeet', 'tdt-', 'rnnt']
const NEMOTRON_KEYWORDS = ['nemotron', 'nemo', 'llama', 'mistral', 'qwen', 'baichuan', 'chatglm', 'gemma']

export function detectModelType(filename: string): ModelType {
	const lower = filename.toLowerCase()

	// 1. SenseVoice 优先（最特异）
	if (SENSEVOICE_KEYWORDS.some(keyword => lower.includes(keyword))) {
		return 'sensevoice'
	}

	// 2. Hunyuan（腾讯混元音频，文件名含 hunyuan/混元）
	if (HUNYUAN_KEYWORDS.some(keyword => lower.includes(keyword))) {
		return 'hunyuan'
	}

	// 3. Parakeet TDT / 其他 RNNT 模型（GGUF，自带 VAD 分段）
	if (PARAKEET_KEYWORDS.some(keyword => lower.includes(keyword))) {
		return 'parakeet'
	}

	// 4. Nemotron（LLM 类，特异关键词）
	if (NEMOTRON_KEYWORDS.some(keyword => lower.includes(keyword))) {
		return 'nemotron'
	}

	// 5. Whisper（最后判定，因为它包含了一些较通用的版本名）
	if (WHISPER_KEYWORDS.some(keyword => lower.includes(keyword))) {
		return 'whisper'
	}

	return 'custom'
}

export function getModelPipeline(filename: string): ModelPipeline {
	const type = detectModelType(filename)
	return MODEL_PIPELINES[type]
}

/**
 * Resolve the pipeline for a model *path*. Folder-based models
 * (`models/transcribe/<ModelName>/model.bin`) must be detected from the folder
 * name, since the file itself is generically named.
 */
export function getModelPipelineFromPath(modelPath: string): ModelPipeline {
	const parts = modelPath.split(/[\\/]/).filter(Boolean)
	const filename = parts[parts.length - 1] ?? ''
	const parent = parts[parts.length - 2] ?? ''
	const genericFile = /^(ggml[-_])?(model|encoder|decoder|sense-voice-encoder)[._-]?[a-z0-9._-]*\.(onnx|bin|gguf)$/i.test(filename)
	return getModelPipeline(genericFile && parent ? parent : filename)
}
