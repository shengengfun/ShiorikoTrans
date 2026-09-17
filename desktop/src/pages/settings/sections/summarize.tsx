import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, Copy } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import * as config from '~/lib/config'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '~/lib/llm'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { SettingRow, SettingsGroup } from '../components/kit'
import type { SettingsViewModel } from './shared'

function ExternalHint({ label, url }: { label: string; url: string }) {
	return (
		<button type="button" className="text-primary underline underline-offset-2 hover:text-primary/80" onClick={() => openUrl(url)}>
			{label}
		</button>
	)
}

export function SummarizeSection({ vm }: { vm: SettingsViewModel }) {
	const config_ = vm.preference.llmConfig

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.processWithLlm()}>
				<SettingRow
					id="summarizeEnabled"
					description={config_.enabled ? m.infoLlmSummarize() : m.summarizeDisabledHint()}
					control={<Switch checked={config_.enabled} onCheckedChange={vm.onEnableLlm} />}
				/>
				<SettingRow
					id="llmPlatform"
					hideDescription
					control={
						<Select
							value={config_.platform}
							onValueChange={(value) => {
								const lang = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
								const defaults =
									value === 'ollama' ? defaultOllamaConfig(lang) : value === 'openai' ? defaultOpenAIConfig(lang) : defaultClaudeConfig(lang)
								vm.preference.setLlmConfig({
									...defaults,
									ollamaBaseUrl: config_.ollamaBaseUrl,
									claudeApiKey: config_.claudeApiKey,
									openaiBaseUrl: config_.openaiBaseUrl,
									openaiApiKey: config_.openaiApiKey,
									enabled: config_.enabled ?? false,
								})
							}}>
							<SelectTrigger className="h-9 w-52 capitalize">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{['claude', 'ollama', 'openai'].map((name) => (
									<SelectItem key={name} value={name} className="capitalize">
										{name === 'openai' ? 'OpenAI Compatible' : name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>

				{config_.platform === 'claude' && (
					<>
						<SettingRow
							id="llmApiKey"
							vertical
							control={
								<div className="space-y-1.5">
									<Input
										value={config_.claudeApiKey}
										onChange={(event) => vm.preference.setLlmConfig({ ...config_, claudeApiKey: event.target.value })}
										placeholder={m.pasteApiKey()}
										className="h-9 max-w-96"
									/>
									<ExternalHint label={m.findHere()} url={config.llmApiKeyUrl} />
								</div>
							}
						/>
						<SettingRow
							id="llmModel"
							vertical
							control={
								<div className="space-y-1.5">
									<Input
										value={config_.model}
										onChange={(event) => vm.preference.setLlmConfig({ ...config_, model: event.target.value })}
										placeholder="claude-sonnet-4-5"
										className="h-9 max-w-96"
									/>
									<ExternalHint label={m.findHere()} url="https://docs.anthropic.com/en/docs/about-claude/models" />
								</div>
							}
						/>
					</>
				)}

				{config_.platform === 'ollama' && (
					<>
						<SettingRow
							id="llmBaseUrl"
							label={m.ollamaBaseUrl()}
							hideDescription
							control={
								<Input
									value={config_.ollamaBaseUrl}
									onChange={(event) => vm.preference.setLlmConfig({ ...config_, ollamaBaseUrl: event.target.value })}
									className="h-9 w-72"
								/>
							}
						/>
						<SettingRow
							id="llmModel"
							vertical
							control={
								<div className="space-y-1.5">
									<Input
										value={config_.model}
										onChange={(event) => vm.preference.setLlmConfig({ ...config_, model: event.target.value })}
										className="h-9 max-w-96"
									/>
									<ExternalHint label={m.findHere()} url={`https://ollama.com/library/${config_.model}`} />
								</div>
							}
						/>
					</>
				)}

				{config_.platform === 'openai' && (
					<>
						<SettingRow
							id="llmBaseUrl"
							hideDescription
							control={
								<Input
									value={config_.openaiBaseUrl}
									onChange={(event) => vm.preference.setLlmConfig({ ...config_, openaiBaseUrl: event.target.value })}
									placeholder="https://api.openai.com/v1"
									className="h-9 w-72"
								/>
							}
						/>
						<SettingRow
							id="llmApiKey"
							label={m.apiKey()}
							hideDescription
							control={
								<Input
									value={config_.openaiApiKey}
									onChange={(event) => vm.preference.setLlmConfig({ ...config_, openaiApiKey: event.target.value })}
									placeholder={m.optionalLocalServerKey()}
									className="h-9 w-72"
								/>
							}
						/>
						<SettingRow
							id="llmModel"
							hideDescription
							control={
								<Input
									value={config_.model}
									onChange={(event) => vm.preference.setLlmConfig({ ...config_, model: event.target.value })}
									placeholder="gpt-4o-mini"
									className="h-9 w-72"
								/>
							}
						/>
					</>
				)}
			</SettingsGroup>

			<SettingsGroup title={m.prompt()}>
				<SettingRow
					id="llmPrompt"
					vertical
					control={
						<Textarea
							value={config_.prompt}
							onChange={(event) => vm.preference.setLlmConfig({ ...config_, prompt: event.target.value })}
							onBlur={vm.validateLlmPrompt}
							className="min-h-[110px] w-full font-mono text-xs"
						/>
					}
				/>
				<SettingRow
					id="llmMaxTokens"
					hideDescription
					info={m.infoMaxTokens()}
					control={
						<Input
							type="number"
							className="h-9 w-28 tabular-nums"
							onChange={(event) => vm.preference.setLlmConfig({ ...config_, maxTokens: vm.parseIntOr(event.target.value, 1) })}
							value={config_.maxTokens}
						/>
					}
				/>
				<SettingRow
					id="runLlmCheck"
					hideDescription
					control={
						<Button onClick={vm.checkLlm} size="sm" className="h-8">
							{m.runLlmCheck()}
						</Button>
					}
				/>
			</SettingsGroup>

			{vm.llmError && (
				<div className="relative rounded-xl border border-destructive/30 bg-destructive/5 p-3 pe-10">
					<button type="button" className="absolute end-2 top-2 p-1 text-muted-foreground hover:text-foreground" onClick={vm.copyLlmError}>
						{vm.llmErrorCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
					</button>
					<pre className="whitespace-pre-wrap break-all text-xs text-destructive">{vm.llmError}</pre>
				</div>
			)}

			{config_.platform === 'claude' && (
				<div className="flex flex-col gap-1 px-1 text-xs">
					<ExternalHint label={m.setMonthlySpendLimit()} url={config.llmLimitsUrl} />
					<ExternalHint label={m.llmCurrentCost()} url={config.llmCostUrl} />
				</div>
			)}
		</div>
	)
}
