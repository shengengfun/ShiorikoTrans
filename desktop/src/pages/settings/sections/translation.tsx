import { getLocale } from '~/paraglide/runtime.js'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '~/lib/llm'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Field, SectionCard } from './shared'
import { usePreferenceProvider } from '~/providers/preference'

export function TranslationSection() {
	const preference = usePreferenceProvider()
	const config = preference.translationLlmConfig

	function setConfig(next: Partial<typeof config>) {
		preference.setTranslationLlmConfig({ ...config, ...next })
	}

	function changePlatform(value: 'claude' | 'ollama' | 'openai') {
		const language = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
		const defaults = value === 'ollama' ? defaultOllamaConfig(language) : value === 'openai' ? defaultOpenAIConfig(language) : defaultClaudeConfig(language)
		preference.setTranslationLlmConfig({
			...defaults,
			enabled: config.enabled,
			ollamaBaseUrl: config.ollamaBaseUrl,
			claudeApiKey: config.claudeApiKey,
			openaiBaseUrl: config.openaiBaseUrl,
			openaiApiKey: config.openaiApiKey,
		})
	}

	return (
		<div className="space-y-5">
			<SectionCard>
				<div className="space-y-4">
					<div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-semibold">翻译模型</h3><p className="mt-1 text-sm text-muted-foreground">翻译页使用独立的模型与连接配置。</p></div><Switch checked={config.enabled} onCheckedChange={(enabled) => setConfig({ enabled })} /></div>
					<Field label="平台"><Select value={config.platform} onValueChange={(value) => changePlatform(value as 'claude' | 'ollama' | 'openai')}><SelectTrigger className="capitalize"><SelectValue /></SelectTrigger><SelectContent>{['ollama', 'openai', 'claude'].map((platform) => <SelectItem key={platform} value={platform}>{platform === 'openai' ? 'OpenAI Compatible' : platform}</SelectItem>)}</SelectContent></Select></Field>
					{config.platform === 'ollama' && <Field label="Ollama URL"><Input value={config.ollamaBaseUrl} onChange={(event) => setConfig({ ollamaBaseUrl: event.target.value })} /></Field>}
					{config.platform === 'openai' && <><Field label="Base URL"><Input value={config.openaiBaseUrl} onChange={(event) => setConfig({ openaiBaseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /></Field><Field label="API Key"><Input value={config.openaiApiKey} onChange={(event) => setConfig({ openaiApiKey: event.target.value })} type="password" /></Field></>}
					{config.platform === 'claude' && <Field label="Claude API Key"><Input value={config.claudeApiKey} onChange={(event) => setConfig({ claudeApiKey: event.target.value })} type="password" /></Field>}
					<Field label="模型"><Input value={config.model} onChange={(event) => setConfig({ model: event.target.value })} /></Field>
					<Field label="最大 Tokens"><Input type="number" value={config.maxTokens ?? ''} onChange={(event) => setConfig({ maxTokens: event.target.value ? Number(event.target.value) : undefined })} /></Field>
				</div>
			</SectionCard>
		</div>
	)
}
