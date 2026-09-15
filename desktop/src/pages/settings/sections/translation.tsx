import { useEffect, useState } from 'react'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { toast } from 'sonner'
import { Check, Copy } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { defaultClaudeConfig, defaultOllamaConfig, OpenAICompatible } from '~/lib/llm'
import { TRANSLATE_LANGUAGES } from '~/lib/translate'
import {
	DEFAULT_LOCAL_BASE_URL,
	LOCAL_SERVER_PRESETS,
	TRANSLATE_MODELS,
	installTranslateModel,
	isTranslateModelInstalled,
	llamaServerCommand,
} from '~/lib/translate-models'
import { useModelDownload } from '~/lib/model-download'
import { useTranslationSession } from '~/providers/translation'
import { usePreferenceProvider } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Field, SectionCard } from './shared'

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

export function TranslationSection() {
	const preference = usePreferenceProvider()
	const session = useTranslationSession()
	const { withProgress } = useModelDownload()

	const config = preference.translationLlmConfig
	const [installingId, setInstallingId] = useState<string | null>(null)
	const [installed, setInstalled] = useState<Record<string, boolean>>({})
	const [checking, setChecking] = useState(false)

	function setConfig(next: Partial<typeof config>) {
		preference.setTranslationLlmConfig({ ...config, ...next })
	}

	async function refreshInstalled() {
		const entries = await Promise.all(TRANSLATE_MODELS.map(async (entry) => [entry.id, await isTranslateModelInstalled(entry)] as const))
		setInstalled(Object.fromEntries(entries))
	}

	useEffect(() => {
		refreshInstalled()
	}, [])

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

	async function download(entryId: string) {
		const entry = TRANSLATE_MODELS.find((model) => model.id === entryId)
		if (!entry) return
		setInstallingId(entry.id)
		try {
			const path = await withProgress(m.downloadingModelNamed({ name: entry.name }) as string, () => installTranslateModel(entry))
			if (path) {
				// Point the engine at the freshly downloaded file straight away.
				setConfig({ model: entry.filename })
				await refreshInstalled()
			}
		} catch (error) {
			console.error('translation model download failed:', error)
			toast.error(String(error))
		} finally {
			setInstallingId(null)
		}
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
			{/* Engine */}
			<SectionCard>
				<div className="space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<h3 className="text-sm font-semibold">{m.enableTranslation()}</h3>
							<p className="mt-1 text-sm text-muted-foreground">{m.enableTranslationInfo()}</p>
						</div>
						<Switch checked={config.enabled} onCheckedChange={(enabled) => setConfig({ enabled })} />
					</div>

					<Field label={m.translationEngine()}>
						<Select value={config.platform} onValueChange={changePlatform}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="openai">{m.engineLocal()}</SelectItem>
								<SelectItem value="ollama">Ollama</SelectItem>
								<SelectItem value="claude">Claude</SelectItem>
							</SelectContent>
						</Select>
					</Field>

					{config.platform === 'openai' && (
						<>
							<p className="text-xs leading-relaxed text-muted-foreground">{m.engineLocalInfo()}</p>
							<Field label={m.enginePreset()}>
								<div className="flex flex-wrap gap-2">
									{LOCAL_SERVER_PRESETS.map((preset) => (
										<Button
											key={preset.id}
											type="button"
											size="sm"
											variant={config.openaiBaseUrl === preset.baseUrl ? 'secondary' : 'outline'}
											onClick={() => setConfig({ openaiBaseUrl: preset.baseUrl })}>
											{preset.label}
										</Button>
									))}
								</div>
							</Field>
							<Field label={m.baseUrl()}>
								<Input
									value={config.openaiBaseUrl ?? ''}
									onChange={(event) => setConfig({ openaiBaseUrl: event.target.value })}
									placeholder={DEFAULT_LOCAL_BASE_URL}
								/>
							</Field>
							<Field label={m.apiKey()}>
								<Input value={config.openaiApiKey ?? ''} onChange={(event) => setConfig({ openaiApiKey: event.target.value })} type="password" placeholder="—" />
							</Field>
						</>
					)}

					{config.platform === 'ollama' && (
						<Field label="Ollama URL">
							<Input value={config.ollamaBaseUrl} onChange={(event) => setConfig({ ollamaBaseUrl: event.target.value })} />
						</Field>
					)}

					{config.platform === 'claude' && (
						<Field label="Claude API Key">
							<Input value={config.claudeApiKey} onChange={(event) => setConfig({ claudeApiKey: event.target.value })} type="password" />
						</Field>
					)}

					<Field label={m.modelName()}>
						<Input value={config.model} onChange={(event) => setConfig({ model: event.target.value })} />
					</Field>

					<Button variant="outline" size="sm" className="w-full" onClick={testConnection} disabled={checking}>
						{checking ? m.checkLoading() : m.testConnection()}
					</Button>
				</div>
			</SectionCard>

			{/* Local model catalog */}
			<SectionCard>
				<div className="space-y-3">
					<div className="space-y-1">
						<h3 className="text-sm font-semibold">{m.translateModels()}</h3>
						<p className="text-xs text-muted-foreground">{m.translateModelsInfo()}</p>
					</div>
					<div className="divide-y divide-border/45 overflow-hidden rounded-xl border border-border/55">
						{TRANSLATE_MODELS.map((entry) => {
							const isInstalled = installed[entry.id] === true
							const busy = installingId === entry.id
							const command = llamaServerCommand(`<models>/${entry.filename}`)
							return (
								<div key={entry.id} className="space-y-1.5 px-3 py-2.5">
									<div className="flex flex-wrap items-center gap-2">
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className="truncate text-sm font-medium">{entry.name}</span>
												<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{entry.quantization}</span>
												{entry.specialised && (
													<span className="rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">{m.translationSpecialised()}</span>
												)}
												{entry.recommended && <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">{m.recommended()}</span>}
											</div>
											<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
												<span>{entry.languages}</span>
												<span>{formatSize(entry.sizeMB)}</span>
											</div>
										</div>
										<Button size="sm" variant={isInstalled ? 'ghost' : 'default'} disabled={busy || installingId !== null} onClick={() => download(entry.id)}>
											{busy ? m.downloadingModel() : isInstalled ? m.installed() : m.download()}
										</Button>
									</div>
									{isInstalled && (
										<div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
											<span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={command}>
												{command}
											</span>
											<CopyCommandButton text={command} />
										</div>
									)}
								</div>
							)
						})}
					</div>
				</div>
			</SectionCard>

			{/* Translation options */}
			<SectionCard>
				<div className="space-y-4">
					<Field label={m.defaultTarget()}>
						<Select value={session.target} onValueChange={session.setTarget}>
							<SelectTrigger>
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
					</Field>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						<Field label={m.chunkSize()}>
							<Input
								type="number"
								min={1}
								max={100}
								value={preference.translateChunkSize}
								onChange={(event) => preference.setTranslateChunkSize(Math.min(100, Math.max(1, Number(event.target.value) || 25)))}
							/>
						</Field>
						<Field label={m.maxTokens()}>
							<Input
								type="number"
								value={config.maxTokens ?? ''}
								onChange={(event) => setConfig({ maxTokens: event.target.value ? Number(event.target.value) : undefined })}
							/>
						</Field>
						<Field label={m.temperature()}>
							<Input
								type="number"
								step={0.1}
								min={0}
								max={2}
								value={config.temperature ?? ''}
								onChange={(event) => setConfig({ temperature: event.target.value === '' ? undefined : Number(event.target.value) })}
							/>
						</Field>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="text-sm font-medium">{m.soundOnTranslateFinish()}</span>
						<Switch checked={preference.soundOnTranslateFinish} onCheckedChange={preference.setSoundOnTranslateFinish} />
					</div>
				</div>
			</SectionCard>
		</div>
	)
}
