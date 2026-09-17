import { useEffect, useState } from 'react'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'sonner'
import { Check, Copy, Download } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { defaultClaudeConfig, defaultOllamaConfig, OpenAICompatible } from '~/lib/llm'
import { TRANSLATE_LANGUAGES, isLocalEndpoint, probeTranslationEngine } from '~/lib/translate'
import {
	DEFAULT_LOCAL_BASE_URL,
	LOCAL_SERVER_PRESETS,
	TRANSLATE_MODELS,
	installTranslateModel,
	isTranslateModelInstalled,
	llamaServerCommand,
	translateModelPath,
} from '~/lib/translate-models'
import { useModelDownload } from '~/lib/model-download'
import { useTranslationSession } from '~/providers/translation'
import { usePreferenceProvider } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { SettingPanel, SettingRow, SettingsGroup, StateBadge } from '../components/kit'

function formatSize(sizeMB: number) {
	return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`
}

/** Copy-to-clipboard button for the command that serves a downloaded model. */
function CopyCommandButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false)
	return (
		<Button
			variant="outline"
			size="sm"
			className="h-7 shrink-0 gap-1.5 px-2"
			onClick={async () => {
				await clipboard.writeText(text)
				setCopied(true)
				toast.success(m.copied())
				window.setTimeout(() => setCopied(false), 1500)
			}}>
			{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
			{m.copyCommand()}
		</Button>
	)
}

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
	const [command, setCommand] = useState('')

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

	// Absolute command so it can be pasted straight into a terminal.
	useEffect(() => {
		let cancelled = false
		translateModelPath(config.model || 'model.gguf')
			.then((path) => {
				if (!cancelled) setCommand(llamaServerCommand(path))
			})
			.catch(() => setCommand(llamaServerCommand(config.model || 'model.gguf')))
		return () => {
			cancelled = true
		}
	}, [config.model])

	async function copyCommand() {
		await clipboard.writeText(command)
		toast.success(m.copied())
	}

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
			await new OpenAICompatible(config).ask('Ping. Reply with the single word: pong')
			toast.success(m.checkSuccess())
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

			{reachable === false && isLocalEndpoint(config) && (
				<SettingsGroup title={m.translateEngineSetup()}>
					<SettingPanel id="translationEngine">
						<div className="flex items-center gap-2">
							<span className="min-w-0 flex-1 truncate rounded-lg bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground" title={command}>
								{command}
							</span>
							<Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 px-2" onClick={copyCommand}>
								<Copy className="h-3.5 w-3.5" />
								{m.copyCommand()}
							</Button>
						</div>
					</SettingPanel>
				</SettingsGroup>
			)}
		</div>
	)
}

function TranslateModelsTab() {
	const { withProgress } = useModelDownload()
	const preference = usePreferenceProvider()
	const [installingId, setInstallingId] = useState<string | null>(null)
	const [installed, setInstalled] = useState<Record<string, boolean>>({})

	async function refreshInstalled() {
		const entries = await Promise.all(TRANSLATE_MODELS.map(async (entry) => [entry.id, await isTranslateModelInstalled(entry)] as const))
		setInstalled(Object.fromEntries(entries))
	}

	useEffect(() => {
		refreshInstalled()
	}, [])

	async function download(entryId: string) {
		const entry = TRANSLATE_MODELS.find((model) => model.id === entryId)
		if (!entry) return
		setInstallingId(entry.id)
		try {
			const path = await withProgress(m.downloadingModelNamed({ name: entry.name }) as string, () =>
				installTranslateModel(entry, preference.hfMirrorEnabled),
			)
			if (path) {
				// Point the engine at the freshly downloaded file straight away.
				preference.setTranslationLlmConfig({ ...preference.translationLlmConfig, model: entry.filename })
				await refreshInstalled()
			}
		} catch (error) {
			console.error('translation model download failed:', error)
			toast.error(String(error))
		} finally {
			setInstallingId(null)
		}
	}

	return (
		<SettingsGroup title={m.translateModels()}>
			<SettingPanel id="translateModels" className="space-y-2">
				<ul className="space-y-2">
					{TRANSLATE_MODELS.map((entry) => {
						const isInstalled = installed[entry.id] === true
						const busy = installingId === entry.id
						const command = llamaServerCommand(`<models>/${entry.filename}`)
						return (
							<li key={entry.id} className="rounded-xl border border-border/55 px-3 py-2.5">
								<div className="flex flex-wrap items-center gap-2">
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-1.5">
											<span className="truncate text-sm font-medium">{entry.name}</span>
											<StateBadge>{entry.quantization}</StateBadge>
											{entry.specialised && <StateBadge tone="primary">{m.translationSpecialised()}</StateBadge>}
											{entry.recommended && <StateBadge tone="primary">{m.recommended()}</StateBadge>}
										</div>
										<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
											<span>{entry.languages}</span>
											<span>{formatSize(entry.sizeMB)}</span>
										</div>
									</div>
									<Button
										size="sm"
										className="h-8 gap-1.5"
										variant={isInstalled ? 'ghost' : 'default'}
										disabled={busy || installingId !== null}
										onClick={() => download(entry.id)}>
										{!isInstalled && !busy && <Download className="h-3.5 w-3.5" />}
										{busy ? m.downloadingModel() : isInstalled ? m.installed() : m.download()}
									</Button>
								</div>
								{isInstalled && (
									<div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
										<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={command}>
											{command}
										</span>
										<CopyCommandButton text={command} />
									</div>
								)}
							</li>
						)
					})}
				</ul>
			</SettingPanel>
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
