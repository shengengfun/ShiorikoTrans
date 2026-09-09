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
 * Translates transcript segments while preserving their count/timing.
 * Uses the configured LLM channel (Ollama for fully local translation).
 * Segments are sent in small chunks to stay within model limits.
 */
export async function translateSegments(
	segments: Segment[],
	targetCode: string,
	config: LlmConfig,
	onChunk?: (done: number, total: number) => void,
): Promise<Segment[]> {
	const llm = makeLlm(config)
	const target = languageName(targetCode)
	const result: Segment[] = segments.map((s) => ({ ...s, text: '' }))
	const CHUNK = 25
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
