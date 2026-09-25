import { Claude, deafultConfig as defaultClaudeConfig } from './claude'
import { Ollama, defaultConfig as defaultOllamaConfig } from './ollama'
import { OpenAICompatible, defaultConfig as defaultOpenAIConfig } from './openai'

export interface Llm {
	ask(prompt: string): Promise<string>
}

export interface LlmConfig {
	/**
	 * `builtin` is the app's own translation engine (a dedicated MT model that
	 * runs in-process); the other three are external services the user points
	 * the app at. Summarisation always uses one of the external ones.
	 */
	platform: 'ollama' | 'claude' | 'openai' | 'builtin'
	enabled: boolean
	prompt: string

	// Claude
	claudeApiKey: string
	model: string
	maxTokens?: number
	/** Optional sampling temperature (used by OpenAI-compatible and Claude). */
	temperature?: number

	// Ollama
	ollamaBaseUrl: string

	// OpenAI Compatible (also used for local servers: llama.cpp / LM Studio / vLLM)
	openaiBaseUrl?: string
	openaiApiKey?: string
}

export { Ollama, Claude, OpenAICompatible, defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig }
