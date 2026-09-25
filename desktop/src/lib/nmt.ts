import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

/**
 * The built-in translation engine.
 *
 * A dedicated machine-translation model (NLLB-200-distilled-600M) runs inside
 * the app on the ONNX Runtime that is already bundled for transcription. There
 * is no server to start and no API key to paste: the only cost is a one-time
 * model download, after which translation works offline.
 */
export const NMT_MODEL_ID = 'nllb-200-distilled-600M'
export const NMT_MODEL_LABEL = 'NLLB-200-distilled-600M'
/** Options the language pickers share; NLLB covers all of them. */
export const NMT_MODEL_INFO = '200 languages · int8 ONNX · 100% offline'

export interface NmtStatus {
    /** Every model file is on disk. */
    installed: boolean
    dir: string
    downloadSizeMb: number
    /** The ONNX sessions are loaded and ready to translate. */
    loaded: boolean
    missing: string[]
}

export function getNmtStatus(): Promise<NmtStatus> {
    return invoke<NmtStatus>('get_nmt_status')
}

/** Downloads the missing model files (progress: the shared download toast). */
export function installNmtModel(): Promise<NmtStatus> {
    return invoke<NmtStatus>('install_nmt_model')
}

/** Translates one string per line, preserving the line count. */
export function nmtTranslate(lines: string[], source: string, target: string): Promise<string[]> {
    return invoke<string[]>('nmt_translate', { lines, source, target })
}

export function cancelNmt(): Promise<void> {
    return invoke('cancel_nmt')
}

/** `done`/`total` are line counts, not percentages. */
export function listenNmtProgress(handler: (done: number, total: number) => void): Promise<UnlistenFn> {
    return listen<{ done: number; total: number }>('nmt_progress', (event) => handler(event.payload.done, event.payload.total))
}

export async function isNmtInstalled(): Promise<boolean> {
    try {
        return (await getNmtStatus()).installed
    } catch {
        return false
    }
}
