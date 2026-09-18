import { getLocale } from '~/paraglide/runtime.js'
import { ensureEngineRunning } from './local-engine'
import { Claude, type Llm, type LlmConfig, Ollama, OpenAICompatible } from './llm'

/**
 * Summarisation on top of any OpenAI-compatible / Ollama / Claude endpoint.
 *
 * Two things make this work with a *small local* model rather than a hosted
 * one: the app starts the bundled llama.cpp server when the endpoint is local,
 * and long transcripts are summarised in chunks (map → reduce) instead of being
 * pushed through a 4k context window in one request.
 */

/** Characters per chunk sent to the model (≈1000 tokens for CJK, less for Latin). */
export const DEFAULT_SUMMARY_CHUNK_CHARS = 3000

const PLACEHOLDER = /%s|\{\{text\}\}|<text>/

export interface SummaryPreset {
	id: string
	label: () => string
	prompt: (language: string) => string
}

function isChinese(): boolean {
	return getLocale().toLowerCase().startsWith('zh')
}

/** Ready-made prompts the user can start from (and then edit). */
export function summaryPresets(): SummaryPreset[] {
	const zh = isChinese()
	return [
		{
			id: 'default',
			label: () => (zh ? '默认摘要' : 'Default summary'),
			prompt: (language) =>
				zh
					? `只输出所要求的内容，不要任何开场白、解释或评论。\n\n用${language}以 Markdown 写一份简洁的总结，包含：\n- 一段简短的概述\n- 3-5 条要点（无序列表）\n- 如果有待办事项，用清单列出\n\n"""\n%s\n"""`
					: `Output only the requested content. No introductions, explanations, or commentary.\n\nWrite a concise summary of this transcript in ${language} using markdown. Include:\n- A short overview paragraph\n- 3-5 key takeaways as bullet points\n- Action items as a checklist if there are any\n\n"""\n%s\n"""`,
		},
		{
			id: 'concise',
			label: () => (zh ? '精简摘要' : 'Short abstract'),
			prompt: (language) =>
				zh
					? `用${language}写 3-5 句话的摘要，只保留最关键的信息，不要列表、不要标题。\n\n内容：\n"""\n%s\n"""`
					: `Summarise the following in ${language} in 3-5 sentences. Keep only the essentials, no lists, no headings.\n\n"""\n%s\n"""`,
		},
		{
			id: 'key-points',
			label: () => (zh ? '要点清单' : 'Key points'),
			prompt: (language) =>
				zh
					? `用${language}输出一份要点清单：每条一行，以「-」开头，最多 10 条，只写结论与关键数字，不要解释。\n\n内容：\n"""\n%s\n"""`
					: `List the key points in ${language}: one per line, starting with "-", at most 10, facts and numbers only, no explanations.\n\n"""\n%s\n"""`,
		},
		{
			id: 'minutes',
			label: () => (zh ? '会议纪要' : 'Meeting minutes'),
			prompt: (language) =>
				zh
					? `用${language}整理成会议纪要，包含：议题、讨论要点、结论、待办（负责人与事项，不确定就写「未指定」）、遗留问题。用小标题分段。\n\n记录：\n"""\n%s\n"""`
					: `Turn this into meeting minutes in ${language} with sections: topics, discussion, decisions, action items (owner + task, write "unassigned" when unknown), open questions.\n\n"""\n%s\n"""`,
		},
		{
			id: 'notes',
			label: () => (zh ? '学习笔记' : 'Study notes'),
			prompt: (language) =>
				zh
					? `用${language}整理成学习笔记：核心概念、要点解释、易混淆之处、可供复习的自测问题（3-5 个）。用 Markdown 标题与列表。\n\n内容：\n"""\n%s\n"""`
					: `Write study notes in ${language}: core concepts, explanations, common confusions and 3-5 self-check questions. Use markdown headings and lists.\n\n"""\n%s\n"""`,
		},
	]
}

/** Default prompt for a fresh installation (English output, like before). */
export function defaultSummaryPrompt(language: string): string {
	return summaryPresets()[0].prompt(language)
}

/**
 * Inserts the transcript into the template. A template without `%s` used to
 * silently drop the transcript, so the text is appended in that case.
 */
export function fillSummaryPrompt(prompt: string, text: string): string {
	return PLACEHOLDER.test(prompt) ? prompt.replace(PLACEHOLDER, text) : `${prompt.trim()}\n\n${text}`
}

function combinePrompt(language: string, parts: number): string {
	return isChinese()
		? `下面是一段长内容分 ${parts} 次得到的局部摘要。用${language}把它们合并成一份连贯的完整总结：去掉重复内容，保持原有结论与数字，不要添加新信息，不要写「以下是合并结果」之类的说明。\n\n局部摘要：\n"""\n%s\n"""`
		: `Below are ${parts} partial summaries of one long transcript. Merge them into a single coherent summary in ${language}: remove duplicates, keep the original conclusions and numbers, add nothing new, and do not write meta commentary.\n\nPartial summaries:\n"""\n%s\n"""`
}

function partNote(index: number, total: number): string {
	return isChinese() ? `（这是第 ${index}/${total} 部分，只总结本部分）` : `(Part ${index}/${total} — summarize this part only)`
}

/** Splits text on line boundaries so chunks stay readable for the model. */
export function splitIntoChunks(text: string, chunkChars: number): string[] {
	const lines = text.split('\n')
	const chunks: string[] = []
	let current = ''
	for (const line of lines) {
		if (current && current.length + line.length + 1 > chunkChars) {
			chunks.push(current)
			current = ''
		}
		// A single line longer than the budget is hard-split so it cannot blow up
		// the context window on its own.
		let rest = line
		while (rest.length > chunkChars) {
			chunks.push(rest.slice(0, chunkChars))
			rest = rest.slice(chunkChars)
		}
		current = current ? `${current}\n${rest}` : rest
	}
	if (current.trim()) chunks.push(current)
	return chunks.length ? chunks : [text]
}

function makeLlm(config: LlmConfig): Llm {
	if (config.platform === 'ollama') return new Ollama(config)
	if (config.platform === 'openai') return new OpenAICompatible(config)
	return new Claude(config)
}

export interface SummarizeOptions {
	text: string
	prompt: string
	config: LlmConfig
	/** Chunk size in characters; `0` disables chunking. */
	chunkChars?: number
	onProgress?: (done: number, total: number) => void
}

/**
 * Summarises a transcript, chunking it when it does not fit in one request.
 * Returns the model's answer (markdown).
 */
export async function summarizeText({ text, prompt, config, chunkChars = DEFAULT_SUMMARY_CHUNK_CHARS, onProgress }: SummarizeOptions): Promise<string> {
	if (!text.trim()) return ''
	// Starts (or reuses) the bundled engine and follows the port it reports.
	await ensureEngineRunning(config)

	const llm = makeLlm(config)
	const language = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
	const chunks = chunkChars > 0 && text.length > chunkChars ? splitIntoChunks(text, chunkChars) : [text]

	if (chunks.length === 1) {
		onProgress?.(1, 1)
		return (await llm.ask(fillSummaryPrompt(prompt, chunks[0])))?.trim() ?? ''
	}

	const parts: string[] = []
	for (const [index, chunk] of chunks.entries()) {
		// The prompt is what carries the user's instructions, so every part uses it.
		const question = `${fillSummaryPrompt(prompt, chunk)}\n\n${partNote(index + 1, chunks.length)}`
		const answer = await llm.ask(question)
		if (answer?.trim()) parts.push(answer.trim())
		onProgress?.(index + 1, chunks.length)
	}
	if (parts.length === 0) return ''
	if (parts.length === 1) return parts[0]

	return (await llm.ask(fillSummaryPrompt(combinePrompt(language, parts.length), parts.join('\n\n---\n\n'))))?.trim() ?? ''
}
