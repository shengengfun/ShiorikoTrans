import { invoke } from '@tauri-apps/api/core'
import * as fs from '@tauri-apps/plugin-fs'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import * as config from '~/lib/config'
import { resolveAuxModelPath } from '~/lib/model-paths'
import type { ModelMetadata } from '~/lib/model'
import { getModelPipelineFromPath, type ModelPipeline } from '~/lib/model-pipeline'
import type { ModelOptions } from '~/providers/preference'

export interface PrepareTranscribeInput {
	path: string
	modelPath: string
	/** Cached metadata; resolved on demand when missing (e.g. quick model switch). */
	modelMetadata: ModelMetadata | null
	modelOptions: ModelOptions
	diarizeEnabled: boolean
	stableTimestampsEnabled: boolean
}

/**
 * Options accepted by the Rust `transcribe` command. Every field is optional
 * there, so engines that don't understand an option simply never receive it.
 */
export interface TranscribeRequestOptions extends Record<string, unknown> {
	path: string
}

/**
 * Keep only the decoding options the selected engine actually implements.
 *
 * sona rejects unsupported options outright (e.g. a Nemotron model fails with
 * "does not support text prompts" as soon as a Whisper-era prompt is still
 * configured), so the shared model options must be filtered per engine.
 */
export function filterModelOptions(pipeline: ModelPipeline, options: ModelOptions) {
	const filtered: Record<string, unknown> = {
		lang: options.lang,
		verbose: options.verbose,
		n_threads: options.n_threads,
		// Engines without translation must receive 'none' instead of a stale target.
		translate: pipeline.supportsTranslation ? options.translate : 'none',
	}
	if (pipeline.supportsPrompt && options.init_prompt) filtered.init_prompt = options.init_prompt
	if (pipeline.supportsTemperature && options.temperature != null) filtered.temperature = options.temperature
	if (pipeline.supportsMaxTextCtx && options.max_text_ctx != null) filtered.max_text_ctx = options.max_text_ctx
	if (pipeline.supportsWordTimestamps) {
		if (options.word_timestamps != null) filtered.word_timestamps = options.word_timestamps
		if (options.max_sentence_len != null) filtered.max_sentence_len = options.max_sentence_len
	}
	if (pipeline.supportsSampling) {
		if (options.sampling_strategy) filtered.sampling_strategy = options.sampling_strategy
		if (options.best_of != null) filtered.best_of = options.best_of
		if (options.beam_size != null) filtered.beam_size = options.beam_size
	}
	return filtered
}

/**
 * Build the full transcribe payload: engine-appropriate options plus the helper
 * models the engine needs (VAD / diarization), downloading the VAD model on
 * demand so a freshly installed model "just works".
 */
export async function prepareTranscribeOptions(input: PrepareTranscribeInput): Promise<{ options: TranscribeRequestOptions; metadata: ModelMetadata | null }> {
	const pipeline = getModelPipelineFromPath(input.modelPath)
	const metadata =
		input.modelMetadata ?? (await invoke<ModelMetadata>('get_model_metadata', { modelPath: input.modelPath }).catch(() => null))
	const requiresVad = metadata?.capabilities.requires_vad ?? pipeline.requiresVad
	const stableTimestamps = input.stableTimestampsEnabled && pipeline.supportsVad
	const wantsDiarize = input.diarizeEnabled && pipeline.supportsDiarization

	let modelsFolder: string | null = null
	if (wantsDiarize || stableTimestamps || requiresVad) {
		modelsFolder = await invoke<string>('get_models_folder')
	}

	const diarizeModel = wantsDiarize && modelsFolder ? await resolveAuxModelPath(modelsFolder, 'diarize', config.diarizeModelFilename) : undefined
	const vadModel = (stableTimestamps || requiresVad) && modelsFolder ? await resolveAuxModelPath(modelsFolder, 'vad', config.vadModelFilename) : undefined

	if (vadModel && !(await fs.exists(vadModel))) {
		toast.info(m.downloadingVadModel(), { position: 'bottom-center' })
		await invoke('download_model', { url: config.vadModelUrl, path: vadModel })
	}

	const options: TranscribeRequestOptions = {
		path: input.path,
		...filterModelOptions(pipeline, input.modelOptions),
		...(diarizeModel ? { diarize_model: diarizeModel } : {}),
		...(vadModel ? { vad_model: vadModel } : {}),
		...(stableTimestamps ? { stable_timestamps: true } : {}),
	}
	return { options, metadata }
}
