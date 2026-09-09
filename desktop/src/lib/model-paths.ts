import { join } from '@tauri-apps/api/path'
import * as fs from '@tauri-apps/plugin-fs'
import { modelSubdirs } from './config'

export type ModelKind = keyof typeof modelSubdirs

/** Purpose sub-directories that must never be scanned as transcription models. */
export const NON_TRANSCRIBE_SUBDIRS: readonly string[] = [modelSubdirs.vad, modelSubdirs.diarize, modelSubdirs.translate]

export function isNonTranscribeSubdir(name: string): boolean {
	return NON_TRANSCRIBE_SUBDIRS.includes(name)
}

/** Returns the (created if needed) purpose sub-directory inside the models folder. */
export async function modelKindDir(modelsFolder: string, kind: ModelKind): Promise<string> {
	const dir = await join(modelsFolder, modelSubdirs[kind])
	await fs.mkdir(dir, { recursive: true })
	return dir
}

/** Destination folder for newly downloaded transcription models. */
export async function transcriptionModelsDir(modelsFolder: string): Promise<string> {
	return modelKindDir(modelsFolder, 'transcribe')
}

/**
 * Effective location of an auxiliary model file (VAD / diarization).
 * When the file already lives in the legacy location (directly inside the models
 * folder) that path is returned so existing installs keep working; otherwise the
 * file is expected to live inside its purpose sub-directory.
 */
export async function resolveAuxModelPath(modelsFolder: string, kind: ModelKind, filename: string): Promise<string> {
	const legacy = await join(modelsFolder, filename)
	if (await fs.exists(legacy)) return legacy
	const dir = await modelKindDir(modelsFolder, kind)
	return join(dir, filename)
}
