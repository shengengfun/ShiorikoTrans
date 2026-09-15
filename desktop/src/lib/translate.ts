import { Claude, type Llm, type LlmConfig, Ollama, OpenAICompatible } from './llm'
import type { Segment } from './transcript'

export interface TranslateLanguage {
	code: string
	name: string
}

/** Common target languages offered in the translation UI. */
export const TRANSLATE_LANGUAGES: TranslateLanguage[] = [
	{ code: 'zh', name: '中文' },
	{ code: 'en', name: 'English' },
	{ code: 'ja', name: '日本語' },
	{ code: 'ko', name: '한국어' },
	{ code: 'ru', name: 'Русский' },
	{ code: 'fr', name: 'Français' },
	{ code: 'de', name: 'Deutsch' },
	{ code: 'es', name: 'Español' },
	{ code: 'it', name: 'Italiano' },
	{ code: 'th', name: 'ไทย' },
	{ code: 'id', name: 'Bahasa Indonesia' },
	{ code: 'pt', name: 'Português' },
	{ code: 'ar', name: 'العربية' },
	{ code: 'hi', name: 'हिन्दी' },
]

export function languageName(code: string): string {
	return TRANSLATE_LANGUAGES.find((l) => l.code === code)?.name ?? code
}

function makeLlm(config: LlmConfig): Llm {
	if (config.platform === 'ollama') return new Ollama(config)
	if (config.platform === 'openai') return new OpenAICompatible(config)
	return new Claude(config)
}

/** True when the configured OpenAI-compatible endpoint runs on this machine. */
export function isLocalEndpoint(config: LlmConfig | null | undefined): boolean {
	const url = config?.openaiBaseUrl ?? ''
	return config?.platform === 'openai' && /127\.0\.0\.1|localhost|\[::1\]/.test(url)
}

/** Short human-readable description of the active translation engine. */
export function translationEngineLabel(config: LlmConfig | null | undefined): string {
	if (!config) return '—'
	if (config.platform === 'ollama') return `Ollama · ${config.model || 'llama3'}`
	if (config.platform === 'claude') return `Claude · ${config.model || 'claude'}`
	return `${isLocalEndpoint(config) ? 'Local' : 'OpenAI-compatible'} · ${config.model || 'gpt-4o-mini'}`
}

function numberedPrompt(target: string, lines: string): string {
	return `Translate the following numbered lines into ${target}.\nKeep every line and reply ONLY as:\n<number>| <translation>\n\n${lines}`
}

/** Translates a raw text blob (used by the translation page). */
export async function translateText(text: string, targetCode: string, config: LlmConfig): Promise<string> {
	const llm = makeLlm(config)
	const answer = await llm.ask(
		`Translate the following text into ${languageName(targetCode)}.\nKeep the structure and line breaks. Output only the translation.\n\n${text}`,
	)
	return answer?.trim() ?? ''
}

/**
 * Translates arbitrarily long plain text line by line, in small chunks, so a
 * local 1–4B model never has to hold the whole transcript in one request.
 * Empty lines are kept in place (they are not sent), and the line count of the
 * source is preserved, which keeps subtitle timing intact.
 */
export async function translateLongText(
	text: string,
	targetCode: string,
	config: LlmConfig,
	onProgress?: (done: number, total: number) => void,
	chunkSize = 25,
): Promise<string> {
	const llm = makeLlm(config)
	const target = languageName(targetCode)
	const source = text.split('\n')
	const pending = source.map((line, index) => ({ line, index })).filter((entry) => entry.line.trim().length > 0)
	if (!pending.length) return ''

	const result = [...source]
	const CHUNK = Math.min(100, Math.max(1, Math.floor(chunkSize) || 25))
	const total = pending.length

	for (let offset = 0; offset < total; offset += CHUNK) {
		const part = pending.slice(offset, offset + CHUNK)
		const lines = part.map((entry, i) => `${i + 1}| ${entry.line}`).join('\n')
		const answer = await llm.ask(numberedPrompt(target, lines))
		if (answer) {
			const parsed = new Map<number, string>()
			for (const line of answer.split('\n')) {
				const match = line.match(/^\s*(\d+)\s*[|.:、]\s*(.+?)\s*$/)
				if (match) parsed.set(Number(match[1]), match[2].trim())
			}
			part.forEach((entry, i) => {
				const translated = parsed.get(i + 1)
				if (translated) result[entry.index] = translated
			})
		}
		onProgress?.(Math.min(offset + CHUNK, total), total)
	}
	return result.join('\n')
}

/**
 * Translates transcript segments while preserving their count/timing.
 * Uses the configured channel (a local OpenAI-compatible server keeps it fully offline).
 * Segments are sent in small chunks to stay within model limits.
 */
export async function translateSegments(
	segments: Segment[],
	targetCode: string,
	config: LlmConfig,
	onChunk?: (done: number, total: number) => void,
	chunkSize = 25,
): Promise<Segment[]> {
	const llm = makeLlm(config)
	const target = languageName(targetCode)
	const result: Segment[] = segments.map((s) => ({ ...s, text: '' }))
	const CHUNK = Math.min(100, Math.max(1, Math.floor(chunkSize) || 25))
	const total = segments.length

	for (let offset = 0; offset < total; offset += CHUNK) {
		const part = segments.slice(offset, offset + CHUNK)
		const lines = part.map((s, i) => `${offset + i + 1}| ${s.text}`).join('\n')
		const answer = await llm.ask(numberedPrompt(target, lines))
		if (!answer) continue

		// Parse "<number>| translation" lines
		const parsed = new Map<number, string>()
		for (const line of answer.split('\n')) {
			const match = line.match(/^\s*(\d+)\s*[|.:、]\s*(.+?)\s*$/)
			if (match) parsed.set(Number(match[1]), match[2].trim())
		}
		for (let i = 0; i < part.length; i++) {
			const idx = offset + i
			const translated = parsed.get(idx + 1)
			if (translated) result[idx] = { ...part[i], text: translated }
		}
		onChunk?.(Math.min(offset + CHUNK, total), total)
	}
	return result
}
