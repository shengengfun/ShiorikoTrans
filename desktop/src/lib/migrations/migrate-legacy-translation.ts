import { NMT_MODEL_ID } from '~/lib/nmt'

const TRANSLATION_CONFIG_KEY = 'prefs_translation_llm_config'

/**
 * Moves the old translation setup onto the built-in engine.
 *
 * Until now translation meant "point the app at an OpenAI-compatible server",
 * and the default config was the local llama.cpp endpoint
 * (`http://127.0.0.1:8080/v1`). Those configs never worked without the user
 * downloading a GGUF and starting `llama-server` by hand, so they are switched
 * to the model the app now ships and runs itself.
 *
 * Configs pointing at a *remote* endpoint are left alone: that user made a
 * deliberate choice and their setup still works.
 */
export function migrateLegacyTranslationEngine() {
    const raw = localStorage.getItem(TRANSLATION_CONFIG_KEY)
    if (!raw) return
    try {
        const config = JSON.parse(raw) as Record<string, unknown> | null
        if (!config || typeof config !== 'object') return
        if (config.platform !== 'openai' && config.platform !== undefined) return
        const baseUrl = String(config.openaiBaseUrl ?? '')
        if (baseUrl && !/127\.0\.0\.1|localhost|\[::1\]/.test(baseUrl)) return
        localStorage.setItem(
            TRANSLATION_CONFIG_KEY,
            JSON.stringify({ ...config, platform: 'builtin', enabled: true, model: NMT_MODEL_ID }),
        )
    } catch {
        // A corrupt value is left for the preference provider to fall back on.
    }
}
