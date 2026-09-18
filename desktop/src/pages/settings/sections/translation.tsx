import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { defaultClaudeConfig, defaultOllamaConfig, OpenAICompatible } from '~/lib/llm'
import { ensureEngineRunning } from '~/lib/local-engine'
import { TRANSLATE_LANGUAGES, isLocalEndpoint, probeTranslationEngine } from '~/lib/translate'
import { DEFAULT_LOCAL_BASE_URL, LOCAL_SERVER_PRESETS } from '~/lib/translate-models'
import { useTranslationSession } from '~/providers/translation'
import { usePreferenceProvider } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { LocalEnginePanel } from '../components/local-engine-panel'
import { LocalModelList } from '../components/local-model-list'
import { SettingRow, SettingsGroup, StateBadge } from '../components/kit'

export function TranslationSection({ tab }: { tab: string }) {
	if (tab === 'models') return <TranslateModelsTab />
	if (tab === 'options') return <OptionsTab />
	return <EngineTab />
}

function EngineTab() {
	const preference = usePreferenceProvider()
	const config = preference.translationLlmConfig
	const [checking, setChecking] = useState(false)
	const [reachable, setReachable] = useState<boolean | null>(null)

	function setConfig(next: Partial<typeof config>) {
		preference.setTranslationLlmConfig({ ...config, ...next })
	}

	// The built-in engine is a server the user runs, so tell them up-front whether
	// anything is listening instead of failing halfway through a translation.
	useEffect(() => {
		let cancelled = false
		setReachable(null)
		probeTranslationEngine(config).then(({ ok }) => {
			if (!cancelled) setReachable(ok)
		})
		return () => {
			cancelled = true
		}
	}, [config.platform, config.openaiBaseUrl, config.ollamaBaseUrl, config.openaiApiKey, config.claudeApiKey])

	function changePlatform(value: string) {
		if (value === 'ollama') {
			setConfig({ ...defaultOllamaConfig(), enabled: config.enabled, model: config.model })
			return
		}
		if (value === 'claude') {
			setConfig({ ...defaultClaudeConfig(), enabled: config.enabled, model: config.model })
			return
		}
		setConfig({ platform: 'openai', openaiBaseUrl: config.openaiBaseUrl || DEFAULT_LOCAL_BASE_URL, openaiApiKey: config.openaiApiKey ?? '' })
	}

	async function testConnection() {
		setChecking(true)
		try {
			// Start the bundled engine when the endpoint is local, so the button
			// reflects reality instead of "nothing is listening yet".
			await ensureEngineRunning(config)
			await new OpenAICompatible(config).ask('Ping. Reply with the single word: pong')
			toast.success(m.checkSuccess())
			setReachable(true)
		} catch (error) {
			toast.error(`${m.checkError()}: ${String(error)}`)
		} finally {
			setChecking(false)
		}
	}

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.translationEngine()}>
				<SettingRow id="enableTranslation" control={<Switch checked={config.enabled} onCheckedChange={(enabled) => setConfig({ enabled })} />} />
				<SettingRow
					id="translationEngine"
					control={
						<Select value={config.platform} onValueChange={changePlatform}>
							<SelectTrigger className="h-9 w-44">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="openai">{m.engineLocal()}</SelectItem>
								<SelectItem value="ollama">Ollama</SelectItem>
								<SelectItem value="claude">Claude</SelectItem>
							</SelectContent>
						</Select>
					}
				/>

				{config.platform === 'openai' && (
					<>
						<SettingRow
							id="enginePreset"
							vertical
							control={
								<div className="flex flex-wrap gap-2">
									{LOCAL_SERVER_PRESETS.map((preset) => (
										<Button
											key={preset.id}
											type="button"
											size="sm"
											variant={config.openaiBaseUrl === preset.baseUrl ? 'secondary' : 'outline'}
											className="h-8"
											onClick={() => setConfig({ openaiBaseUrl: preset.baseUrl })}>
											{preset.label}
										</Button>
									))}
								</div>
							}
						/>
						<SettingRow
							id="baseUrl"
							control={
								<Input
									value={config.openaiBaseUrl ?? ''}
									onChange={(event) => setConfig({ openaiBaseUrl: event.target.value })}
									placeholder={DEFAULT_LOCAL_BASE_URL}
									className="h-9 w-72"
								/>
							}
						/>
						<SettingRow
							id="apiKey"
							control={
								<Input
									value={config.openaiApiKey ?? ''}
									onChange={(event) => setConfig({ openaiApiKey: event.target.value })}
									type="password"
									placeholder="—"
									className="h-9 w-72"
								/>
							}
						/>
					</>
				)}

				{config.platform === 'ollama' && (
					<SettingRow
						id="baseUrl"
						label="Ollama URL"
						hideDescription
						control={<Input value={config.ollamaBaseUrl} onChange={(event) => setConfig({ ollamaBaseUrl: event.target.value })} className="h-9 w-72" />}
					/>
				)}

				{config.platform === 'claude' && (
					<SettingRow
						id="apiKey"
						label="Claude API key"
						hideDescription
						control={
							<Input
								value={config.claudeApiKey}
								onChange={(event) => setConfig({ claudeApiKey: event.target.value })}
								type="password"
								className="h-9 w-72"
							/>
						}
					/>
				)}

				<SettingRow id="gatewayModel" control={<Input value={config.model} onChange={(event) => setConfig({ model: event.target.value })} className="h-9 w-72" />} />
				<SettingRow
					id="testConnection"
					control={
						<div className="flex items-center gap-2">
							<StateBadge tone={reachable === null ? 'muted' : reachable ? 'primary' : 'warning'}>
								{reachable === null ? m.translateEngineChecking() : reachable ? m.translateEngineOnline() : m.translateEngineOffline()}
							</StateBadge>
							<Button variant="outline" size="sm" className="h-8" onClick={testConnection} disabled={checking}>
								{checking ? m.checkLoading() : m.testConnection()}
							</Button>
						</div>
					}
				/>
			</SettingsGroup>

			{isLocalEndpoint(config) && (
				<LocalEnginePanel
					id="translationLocalEngine"
					title={m.translationLocalTitle()}
					hint={m.translationLocalHint()}
					model={config.model}
					onBaseUrl={(url) => setConfig({ openaiBaseUrl: url })}
				/>
			)}
		</div>
	)
}

function TranslateModelsTab() {
	const preference = usePreferenceProvider()

	return (
		<SettingsGroup title={m.translateModels()}>
			<LocalModelList
				id="translateModels"
				selected={preference.translationLlmConfig.model}
				onSelect={(filename) => preference.setTranslationLlmConfig({ ...preference.translationLlmConfig, model: filename })}
			/>
		</SettingsGroup>
	)
}

function OptionsTab() {
	const preference = usePreferenceProvider()
	const session = useTranslationSession()
	const config = preference.translationLlmConfig

	function setConfig(next: Partial<typeof config>) {
		preference.setTranslationLlmConfig({ ...config, ...next })
	}

	return (
		<SettingsGroup title={m.tabOptions()}>
			<SettingRow
				id="translateDefaults"
				control={
					<Select value={session.target} onValueChange={session.setTarget}>
						<SelectTrigger className="h-9 w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TRANSLATE_LANGUAGES.map((lang) => (
								<SelectItem key={lang.code} value={lang.code}>
									{lang.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				}
			/>
			<SettingRow
				id="translateChunkSize"
				control={
					<Input
						type="number"
						min={1}
						max={100}
						className="h-9 w-24 tabular-nums"
						value={preference.translateChunkSize}
						onChange={(event) => preference.setTranslateChunkSize(Math.min(100, Math.max(1, Number(event.target.value) || 25)))}
					/>
				}
			/>
			<SettingRow
				id="translateMaxTokens"
				hideDescription
				control={
					<Input
						type="number"
						className="h-9 w-24 tabular-nums"
						value={config.maxTokens ?? ''}
						onChange={(event) => setConfig({ maxTokens: event.target.value ? Number(event.target.value) : undefined })}
					/>
				}
			/>
			<SettingRow
				id="translateTemperature"
				hideDescription
				control={
					<Input
						type="number"
						step={0.1}
						min={0}
						max={2}
						className="h-9 w-24 tabular-nums"
						value={config.temperature ?? ''}
						onChange={(event) => setConfig({ temperature: event.target.value === '' ? undefined : Number(event.target.value) })}
					/>
				}
			/>
		</SettingsGroup>
	)
}
