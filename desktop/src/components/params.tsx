import { ReactNode, useEffect, useRef, useState } from 'react'

import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { ModifyState } from '~/lib/types'
import { InfoTooltip } from './info-tooltip'
import { ModelOptions as IModelOptions, usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'
import { listen } from '@tauri-apps/api/event'
import * as config from '~/lib/config'
import * as fs from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { openUrl as shellOpen } from '@tauri-apps/plugin-opener'
import { join } from '@tauri-apps/api/path'
import { toast as hotToast } from 'sonner'
import * as dialog from '@tauri-apps/plugin-dialog'
import { Claude, defaultClaudeConfig, defaultOllamaConfig, defaultOpenAIConfig, Llm, Ollama, OpenAICompatible } from '~/lib/llm'
import { Check, Copy } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog'
import { ScrollArea } from '~/components/ui/scroll-area'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

interface ParamsProps {
	options: IModelOptions
	setOptions: ModifyState<IModelOptions>
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
	return (
		<div className="space-y-2 w-full">
			<Label className="flex items-center gap-1">{label}</Label>
			{children}
		</div>
	)
}

export default function ModelOptions({ options, setOptions }: ParamsProps) {
	const [open, setOpen] = useState(false)
	const preference = usePreferenceProvider()
	const toast = useToastProvider()
	const [llm, setLlm] = useState<Llm | null>(null)
	const [llmError, setLlmError] = useState<string | null>(null)
	const [llmErrorCopied, setLlmErrorCopied] = useState(false)
	const llmErrorCopyTimer = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (llmErrorCopyTimer.current) window.clearTimeout(llmErrorCopyTimer.current)
		}
	}, [])

	useEffect(() => {
		const platform = preference.llmConfig?.platform
		const llmInstance = platform === 'ollama' ? new Ollama(preference.llmConfig) : platform === 'openai' ? new OpenAICompatible(preference.llmConfig) : new Claude(preference.llmConfig)
		setLlm(llmInstance)
	}, [preference.llmConfig])

	useEffect(() => {
		listen<[number, number]>('download_progress', (event) => {
			const [current, total] = event.payload
			toast.setProgress(Number(current / total) * 100)
		})
	}, [])

	async function validateLlmPrompt() {
		const valid = Boolean(preference.llmConfig?.prompt && preference.llmConfig.prompt.includes('%s'))
		if (!valid) {
			await dialog.message(m.invalidLlmPrompt(), { kind: 'error' })
		}
		return valid
	}

	const llmConfig = preference.llmConfig
	const setLlmConfig = preference.setLlmConfig

	function onEnableLlm() {
		preference.setLlmConfig({ ...llmConfig, enabled: !llmConfig?.enabled })
	}

	async function checkLlm() {
		setLlmError(null)
		try {
			const promise = llm!.ask('Hello, how are you?')
			hotToast.promise(promise, {
				error: m.checkError(),
				success: m.checkSuccess(),
				loading: m.checkLoading(),
			})
			await promise
		} catch (e) {
			console.error(e)
			setLlmError(String(e))
		}
	}

	function parseIntOr(value: string, fallback: number) {
		const n = parseInt(value, 10)
		return Number.isNaN(n) ? fallback : n
	}

	async function handleStableTimestampsToggle(checked: boolean) {
		if (!checked) {
			preference.setStableTimestampsEnabled(false)
			return
		}
		try {
			const modelsFolder = await invoke<string>('get_models_folder')
			const modelPath = await join(modelsFolder, config.vadModelFilename)
			const exists = await fs.exists(modelPath)
			if (exists) {
				preference.setStableTimestampsEnabled(true)
			} else {
				const confirmed = await dialog.ask(
					'Stable timestamps requires a VAD model (~1MB). Download it now?',
					{ title: 'Stable timestamps', kind: 'info' }
				)
				if (confirmed) {
					toast.setMessage('Downloading VAD model...')
					toast.setOpen(true)
					toast.setProgress(0)
					try {
						await invoke('download_model', { url: config.vadModelUrl, path: modelPath })
						preference.setStableTimestampsEnabled(true)
						hotToast.success(m.downloadComplete())
					} finally {
						toast.setOpen(false)
						toast.setProgress(null)
					}
				}
			}
		} catch (e) {
			console.error('stable timestamps setup failed:', e)
			hotToast.error(String(e))
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					className="mt-1 h-9 rounded-md border border-border/65 px-3 text-sm font-medium text-muted-foreground hover:bg-accent/45 hover:text-foreground">
					{m.moreOptions()}
				</Button>
			</DialogTrigger>
			<DialogContent className="flex h-[85vh] max-h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-border/60 bg-card/95 p-0 shadow-xl">
				<DialogHeader className="px-6 pb-3 pt-5">
					<p className="app-kicker">{m.moreOptions()}</p>
					<DialogTitle className="mt-1 text-2xl font-semibold">{m.moreOptions()}</DialogTitle>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1 px-6 pb-5 pt-2">
					<div className="space-y-6 pb-6">
						{/* LLM Section */}
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<h3 className="text-lg font-semibold">{m.processWithLlm()} ✨</h3>
									<InfoTooltip text={m.infoLlmSummarize()} />
								</div>
								<Switch checked={preference.llmConfig?.enabled} onCheckedChange={onEnableLlm} />
							</div>

							<Field label={m.llmPlatform()}>
								<Select
									value={llmConfig?.platform}
									onValueChange={(value) => {
										const lang = new Intl.DisplayNames([getLocale()], { type: 'language' }).of(getLocale()) ?? 'English'
										const defaults =
											value === 'ollama' ? defaultOllamaConfig(lang) : value === 'openai' ? defaultOpenAIConfig(lang) : defaultClaudeConfig(lang)
										setLlmConfig({
											...defaults,
											ollamaBaseUrl: llmConfig.ollamaBaseUrl,
											claudeApiKey: llmConfig.claudeApiKey,
											openaiBaseUrl: llmConfig.openaiBaseUrl,
											openaiApiKey: llmConfig.openaiApiKey,
											enabled: llmConfig?.enabled ?? false,
										})
									}}>
									<SelectTrigger className="capitalize">
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
							</Field>

							{llmConfig?.platform === 'claude' && (
								<>
									<Field
										label={
											<>
												<InfoTooltip text={m.infoLlmApiKey()} />
												{m.llmApiKey()}
												<button type="button" className="text-primary underline hover:text-primary/80 ml-1" onClick={() => shellOpen(config.llmApiKeyUrl)}>
													{m.findHere()}
												</button>
											</>
										}>
										<Input
											value={llmConfig?.claudeApiKey}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, claudeApiKey: e.target.value })}
											placeholder="在此粘贴你的 API Key"
											type="text"
										/>
									</Field>
									<Field
										label={
											<>
												{m.llmModel()}
												<button
													type="button"
													className="text-primary underline hover:text-primary/80 ml-1"
													onClick={() => shellOpen('https://docs.anthropic.com/en/docs/about-claude/models')}>
													{m.findHere()}
												</button>
											</>
										}>
										<Input
											value={llmConfig?.model}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })}
											placeholder="claude-sonnet-4-5"
										/>
									</Field>
								</>
							)}

							{llmConfig?.platform === 'ollama' && (
								<>
									<Field label={m.ollamaBaseUrl()}>
										<Input
											value={llmConfig?.ollamaBaseUrl}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, ollamaBaseUrl: e.target.value })}
										/>
									</Field>
									<Field
										label={
											<>
												{m.llmModel()}
												<button
													type="button"
													className="text-primary underline hover:text-primary/80 ml-1"
													onClick={() => shellOpen(`https://ollama.com/library/${llmConfig.model}`)}>
													{m.findHere()}
												</button>
											</>
										}>
										<Input value={llmConfig?.model} onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })} />
									</Field>
								</>
							)}

							{llmConfig?.platform === 'openai' && (
								<>
									<Field label="Base URL">
										<Input
											value={llmConfig?.openaiBaseUrl}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, openaiBaseUrl: e.target.value })}
											placeholder="https://api.openai.com/v1"
										/>
									</Field>
									<Field label="API Key">
										<Input
											value={llmConfig?.openaiApiKey}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, openaiApiKey: e.target.value })}
											placeholder="sk-... (optional for local servers)"
											type="text"
										/>
									</Field>
									<Field label={m.llmModel()}>
										<Input
											value={llmConfig?.model}
											onChange={(e) => setLlmConfig({ ...preference.llmConfig, model: e.target.value })}
											placeholder="gpt-4o-mini"
										/>
									</Field>
								</>
							)}

							<Field
								label={
									<>
<InfoTooltip text={m.infoLlmPrompt()} />
											{m.llmPrompt()}
										</>
									}>
									<Textarea
										value={llmConfig?.prompt}
										onChange={(e) => setLlmConfig({ ...preference.llmConfig, prompt: e.target.value })}
										onBlur={validateLlmPrompt}
										className="min-h-[100px]"
									/>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={m.infoMaxTokens()} />
											{m.maxTokens()}
										</>
									}>
									<Input
										type="number"
										onChange={(e) => setLlmConfig({ ...llmConfig, maxTokens: parseIntOr(e.target.value, 1) })}
										value={llmConfig?.maxTokens}
									/>
								</Field>

								<Button onClick={checkLlm} size="sm" className="w-full">
									{m.runLlmCheck()}
							</Button>

							{llmError && (
								<div className="relative rounded-lg border border-destructive/30 bg-destructive/5 p-3 pe-10">
									<button
										type="button"
										className="absolute end-2 top-2 p-1 text-muted-foreground hover:text-foreground"
										onClick={() => {
											navigator.clipboard.writeText(llmError)
											setLlmErrorCopied(true)
											if (llmErrorCopyTimer.current) window.clearTimeout(llmErrorCopyTimer.current)
											llmErrorCopyTimer.current = window.setTimeout(() => {
												setLlmErrorCopied(false)
												llmErrorCopyTimer.current = null
											}, 2000)
										}}>
										{llmErrorCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
									</button>
									<pre className="whitespace-pre-wrap break-all text-xs text-destructive">{llmError}</pre>
								</div>
							)}

							{llmConfig?.platform === 'claude' && (
								<div className="flex flex-col gap-2 text-sm">
									<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => shellOpen(config.llmLimitsUrl)}>
										{m.setMonthlySpendLimit()}
									</button>
									<button type="button" className="text-left text-primary underline hover:text-primary/80" onClick={() => shellOpen(config.llmCostUrl)}>
										{m.llmCurrentCost()}
									</button>
								</div>
							)}
						</div>

						<div className="h-px bg-border/45" />

						{/* Diarization Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">{m.diarization()}</h3>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium flex items-center gap-1">
									<InfoTooltip text={m.infoDiarization()} />
									{m.enableDiarization()}
								</span>
								<Switch
									checked={preference.diarizeEnabled}
									onCheckedChange={async (checked) => {
										if (!checked) {
											preference.setDiarizeEnabled(false)
											return
										}
										try {
											const modelsFolder = await invoke<string>('get_models_folder')
											const modelPath = await join(modelsFolder, config.diarizeModelFilename)
											const exists = await fs.exists(modelPath)
											if (exists) {
												preference.setDiarizeEnabled(true)
											} else {
												const confirmed = await dialog.ask(
													m.downloadDiarizeModel(),
													{ title: m.diarization(), kind: 'info' }
												)
												if (confirmed) {
													toast.setMessage(m.downloadingDiarizeModel())
													toast.setOpen(true)
													toast.setProgress(0)
													try {
														await invoke('download_model', { url: config.diarizeModelUrl, path: modelPath })
														preference.setDiarizeEnabled(true)
														hotToast.success(m.downloadComplete())
													} finally {
														toast.setOpen(false)
														toast.setProgress(null)
													}
												}
											}
										} catch (e) {
											console.error('diarization setup failed:', e)
											hotToast.error(String(e))
										}
									}}
								/>
							</div>
							{preference.diarizeEnabled && (
								<p className="text-sm italic text-muted-foreground">{m.diarizeMaxSpeakersNote()}</p>
							)}
						</div>

						<div className="h-px bg-border/45" />

						{/* Stable Timestamps Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">稳定时间戳</h3>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium flex items-center gap-1">
									<InfoTooltip text="使用 VAD 逐段解码以获得更精准的字幕时间轴。速度约慢 4 倍，适合电影/长文本转录场景。" />
									启用稳定时间戳
								</span>
								<Switch checked={preference.stableTimestampsEnabled} onCheckedChange={handleStableTimestampsToggle} />
							</div>
						</div>

						<div className="h-px bg-border/45" />

						{/* Model Options Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">{m.modelOptions()}</h3>

							<Field
								label={
									<>
										<InfoTooltip text={m.infoTranslateToEnglish()} />
										{m.translateToEnglish()}
									</>
								}>
								<Select
									value={options.translate}
									onValueChange={(value) =>
										setOptions({ ...options, translate: value as 'none' | 'en' | 'zh' | 'ru' | 'ja' | 'fr' | 'de' | 'es' | 'ko' | 'it' })
									}
								>
									<SelectTrigger className="capitalize">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">None</SelectItem>
										<SelectItem value="en">English</SelectItem>
										<SelectItem value="zh">中文</SelectItem>
										<SelectItem value="ru">Русский</SelectItem>
										<SelectItem value="ja">日本語</SelectItem>
										<SelectItem value="fr">Français</SelectItem>
										<SelectItem value="de">Deutsch</SelectItem>
										<SelectItem value="es">Español</SelectItem>
										<SelectItem value="ko">한국어</SelectItem>
										<SelectItem value="it">Italiano</SelectItem>
									</SelectContent>
								</Select>
							</Field>

							<Field
								label={
									<>
										<InfoTooltip text={m.infoPrompt()} />
										{m.prompt()} ({m.leftover()} {1024 - (options?.init_prompt?.length ?? 0)} {m.characters()})
									</>
								}>
								<Textarea
									value={options?.init_prompt}
									onChange={(e) => setOptions({ ...options, init_prompt: e.target.value.slice(0, 1024) })}
									className="min-h-[80px]"
								/>
							</Field>

							<div className="flex items-center justify-between">
								<span className="text-sm font-medium flex items-center gap-1">
									<InfoTooltip text={m.infoUseWordTimestamps()} />
									{m.useWordTimestamps()}
								</span>
								<Switch checked={Boolean(options.word_timestamps)} onCheckedChange={(checked) => setOptions({ ...options, word_timestamps: checked })} />
							</div>

							<div className="grid grid-cols-2 gap-4">
								<Field
									label={
										<>
											<InfoTooltip text={m.infoMaxSentenceLen()} />
											{m.maxSentenceLen()}
										</>
									}>
									<Input
										type="number"
										value={options.max_sentence_len}
										onChange={(e) => {
											if (!options.word_timestamps) dialog.message(m.pleaseEnableWordTimestamps())
											setOptions({ ...options, max_sentence_len: parseIntOr(e.target.value, 1) })
										}}
									/>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={m.infoThreads()} />
											{m.threads()}
										</>
									}>
									<Input type="number" value={options.n_threads} onChange={(e) => setOptions({ ...options, n_threads: parseIntOr(e.target.value, 1) })} />
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={m.infoTemperature()} />
											{m.temperature()}
										</>
									}>
									<Input
										type="number"
										step={0.1}
										value={options.temperature}
										onChange={(e) => setOptions({ ...options, temperature: parseFloat(e.target.value) || 0 })}
									/>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={m.infoMaxTextCtx()} />
											{m.maxTextCtx()}
										</>
									}>
									<Input
										type="number"
										step={1}
										value={options.max_text_ctx ?? 0}
										onChange={(e) => setOptions({ ...options, max_text_ctx: parseIntOr(e.target.value, 0) })}
									/>
								</Field>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<Field
									label={
										<>
											<InfoTooltip text="贪心搜索 vs 束搜索：默认使用束搜索（大小 5，耐心 -1），每步评估 5 个可能序列以获得更准确结果，但速度较慢。贪心搜索每步从 top 5 中选择最佳 token，速度更快但准确性可能略低。" />
											{m.samplingStrategy()}
										</>
									}>
									<Select
										value={preference.modelOptions.sampling_strategy}
										onValueChange={(value) =>
											preference.setModelOptions({ ...preference.modelOptions, sampling_strategy: value as 'greedy' | 'beam search' })
										}>
										<SelectTrigger className="capitalize">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{['beam search', 'greedy'].map((name) => (
												<SelectItem key={name} value={name} className="capitalize">
													{name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>

								<Field
									label={
										<>
											<InfoTooltip text={preference.modelOptions.sampling_strategy === 'greedy'
												? "Top candidates in Greedy mode (default: 5) — higher = better accuracy, slower."
												: "Paths explored in Beam Search (default: 5) — higher = better accuracy, slower."} />
											{preference.modelOptions.sampling_strategy === 'greedy' ? 'Best of' : 'Beam size'}
										</>
									}>
									<Input
										type="number"
										step={1}
										value={preference.modelOptions.sampling_strategy === 'greedy'
											? (preference.modelOptions.best_of ?? 5)
											: (preference.modelOptions.beam_size ?? 5)}
										onChange={(e) => {
											const val = parseIntOr(e.target.value, 5)
											if (preference.modelOptions.sampling_strategy === 'greedy') {
												setOptions({ ...options, best_of: val })
											} else {
												setOptions({ ...options, beam_size: val })
											}
										}}
									/>
								</Field>
							</div>
						</div>

						<div className="h-px bg-border" />

						{/* FFmpeg Options Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">{m.ffmpegOptions()}</h3>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium flex items-center gap-1">
									<InfoTooltip text={m.infoNormalizeLoudness()} />
									{m.normalizeLoudness()}
								</span>
								<Switch
									checked={preference.ffmpegOptions.normalize_loudness}
									onCheckedChange={(checked) => preference.setFfmpegOptions({ ...preference.ffmpegOptions, normalize_loudness: checked })}
								/>
							</div>

							<Field
								label={
									<>
										<InfoTooltip text={'ffmpeg -i {input} -ar 16000 -ac 1 -c:a pcm_s16le {custom_command} -hide_banner -y -loglevel error'} />
										{m.customFfmpegCommand()}
									</>
								}>
								<Input
									value={preference.ffmpegOptions.custom_command ?? ''}
									onChange={(e) => preference.setFfmpegOptions({ ...preference.ffmpegOptions, custom_command: e.target.value || null })}
									placeholder={preference.ffmpegOptions.normalize_loudness ? '-af loudnorm=I=-16:TP=-1.5:LRA=11' : ''}
									type="text"
								/>
							</Field>
						</div>

						<div className="h-px bg-border" />

						{/* Presets Section */}
						<div className="space-y-4">
							<h3 className="text-lg font-semibold">{m.presets()}</h3>
							<div className="flex gap-4">
								<Button variant="secondary" onClick={preference.enableSubtitlesPreset} className="flex-1">
									{m.presetForSubtitles()}
								</Button>
								<Button variant="secondary" onClick={preference.resetOptions} className="flex-1">
									{m.resetOptions()}
								</Button>
							</div>
						</div>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}
