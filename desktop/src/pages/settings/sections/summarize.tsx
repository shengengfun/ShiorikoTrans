import { useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Check, Copy, RotateCcw } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import * as config from '~/lib/config'
import { defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig } from '~/lib/llm'
import { isLocalUrl } from '~/lib/local-engine'
import { defaultSummaryPrompt, summaryPresets } from '~/lib/summarize'
import { DEFAULT_LOCAL_BASE_URL } from '~/lib/translate-models'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { LocalEnginePanel } from '../components/local-engine-panel'
import { LocalModelList } from '../components/local-model-list'
import { SettingRow, SettingsGroup } from '../components/kit'
import type { SettingsViewModel } from './shared'

function ExternalHint({ label, url }: { label: string; url: string }) {
	return (
		<button type="button" className="text-primary underline underline-offset-2 hover:text-primary/80" onClick={() => openUrl(url)}>
			{label}
		</button>
	)
}

function displayLanguage() {
	return new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
}

export function SummarizeSection({ vm }: { vm: SettingsViewModel }) {
	const config_ = vm.preference.llmConfig
	const [modelRefresh, setModelRefresh] = useState(0)
	const presets = summaryPresets()
	const isLocal = config_.platform === 'openai' && isLocalUrl(config_.openaiBaseUrl)

	function set(next: Partial<typeof config_>) {
		vm.preference.setLlmConfig({ ...config_, ...next })
	}

	/** Switches to the built-in engine: a local OpenAI-compatible endpoint. */
	function useBuiltinEngine() {
		set({ platform: 'openai', openaiBaseUrl: DEFAULT_LOCAL_BASE_URL, openaiApiKey: '', enabled: true })
	}

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
								const lang = displayLanguage()
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
										{name === 'openai' ? m.engineLocal() : name}
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

				{config_.platform === 'openai' && !isLocal && (
					<SettingRow
						id="llmBaseUrl"
						hideDescription
						control={
							<div className="flex items-center gap-2">
								<Input
									value={config_.openaiBaseUrl}
									onChange={(event) => set({ openaiBaseUrl: event.target.value })}
									placeholder="https://api.openai.com/v1"
									className="h-9 w-72"
								/>
								<Button size="sm" variant="outline" className="h-9 shrink-0" onClick={useBuiltinEngine}>
									{m.useBuiltinLocalModel()}
								</Button>
							</div>
						}
					/>
				)}

				{isLocal && (
					<LocalEnginePanel
						id="summarizeLocalEngine"
						title={m.summaryLocalTitle()}
						hint={m.summaryLocalHint()}
						model={config_.model}
						onBaseUrl={(url) => set({ openaiBaseUrl: url })}
						refreshKey={modelRefresh}
					/>
				)}

				{config_.platform === 'openai' && (
					<SettingRow
						id="llmModel"
						hideDescription
						control={
							<Input value={config_.model} onChange={(event) => set({ model: event.target.value })} placeholder="qwen3-1.7b-q4" className="h-9 w-72" />
						}
					/>
				)}

				{config_.platform === 'openai' && !isLocal && (
					<SettingRow
						id="llmApiKey"
						label={m.apiKey()}
						hideDescription
						control={
							<Input
								value={config_.openaiApiKey}
								onChange={(event) => set({ openaiApiKey: event.target.value })}
								placeholder={m.optionalLocalServerKey()}
								className="h-9 w-72"
							/>
						}
					/>
				)}
			</SettingsGroup>

			{config_.platform === 'openai' && (
				<SettingsGroup title={m.summarizeLocalModels()}>
					<LocalModelList
						id="summarizeLocalModels"
						selected={config_.model}
						onSelect={(filename) => {
							set({ model: filename, platform: 'openai' })
							setModelRefresh((value) => value + 1)
						}}
						onChange={() => setModelRefresh((value) => value + 1)}
					/>
				</SettingsGroup>
			)}

			<SettingsGroup title={m.prompt()}>
				<SettingRow
					id="summaryPreset"
					hideDescription
					control={
						<Select
							value={presets.find((preset) => preset.prompt(displayLanguage()) === config_.prompt)?.id ?? ''}
							onValueChange={(id) => {
								const preset = presets.find((entry) => entry.id === id)
								if (preset) set({ prompt: preset.prompt(displayLanguage()) })
							}}>
							<SelectTrigger className="h-9 w-52">
								<SelectValue placeholder={m.summaryPreset()} />
							</SelectTrigger>
							<SelectContent>
								{presets.map((preset) => (
									<SelectItem key={preset.id} value={preset.id}>
										{preset.label()}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>
				<SettingRow
					id="llmPrompt"
					vertical
					control={
						<div className="w-full space-y-2">
							<Textarea
								value={config_.prompt}
								onChange={(event) => set({ prompt: event.target.value })}
								onBlur={vm.validateLlmPrompt}
								className="min-h-[150px] w-full font-mono text-xs"
							/>
							<Button
								size="sm"
								variant="outline"
								className="h-8 gap-1.5"
								onClick={() => set({ prompt: defaultSummaryPrompt(displayLanguage()) })}>
								<RotateCcw className="h-3.5 w-3.5" />
								{m.restoreDefaultPrompt()}
							</Button>
						</div>
					}
				/>
				<SettingRow
					id="summaryChunkChars"
					info={m.infoSummaryChunkChars()}
					control={
						<Input
							type="number"
							min={0}
							step={500}
							className="h-9 w-28 tabular-nums"
							value={vm.preference.summarizeChunkChars}
							onChange={(event) => vm.preference.setSummarizeChunkChars(Math.max(0, Number(event.target.value) || 0))}
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
							onChange={(event) => set({ maxTokens: vm.parseIntOr(event.target.value, 1) })}
							value={config_.maxTokens}
						/>
					}
				/>
				<SettingRow
					id="llmTemperature"
					hideDescription
					control={
						<Input
							type="number"
							step={0.1}
							min={0}
							max={2}
							className="h-9 w-28 tabular-nums"
							value={config_.temperature ?? ''}
							onChange={(event) => set({ temperature: event.target.value === '' ? undefined : Number(event.target.value) })}
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
