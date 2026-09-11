import { invoke } from '@tauri-apps/api/core'
import { FolderOpen } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { useAuxModelToggles } from '~/lib/aux-model-toggles'
import { useTranscriptionModels, modelDisplayName } from '~/lib/model-list'
import { getModelPipelineFromPath, MODEL_PIPELINES, type ModelPipeline } from '~/lib/model-pipeline'
import { usePreferenceProvider } from '~/providers/preference'

interface ModelSettingsDialogProps {
	open: boolean
	setOpen: (value: boolean) => void
	/** Model the dialog was opened for; falls back to the selected model. */
	modelPath?: string | null
}

function parseIntOr(value: string, fallback: number) {
	const n = parseInt(value, 10)
	return Number.isNaN(n) ? fallback : n
}

const TRANSLATE_OPTIONS = [
	{ value: 'none', label: 'None' },
	{ value: 'en', label: 'English' },
	{ value: 'zh', label: '中文' },
	{ value: 'ru', label: 'Русский' },
	{ value: 'ja', label: '日本語' },
	{ value: 'fr', label: 'Français' },
	{ value: 'de', label: 'Deutsch' },
	{ value: 'es', label: 'Español' },
	{ value: 'ko', label: '한국어' },
	{ value: 'it', label: 'Italiano' },
] as const

function Capability({ label, supported }: { label: string; supported: boolean }) {
	return (
		<span
			className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
				supported ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground line-through'
			}`}>
			{label}
		</span>
	)
}

/**
 * Dedicated model settings dialog. Options are grouped by engine capability, so
 * a SenseVoice / Nemotron / Hunyuan model only sees what it actually supports.
 */
export default function ModelSettingsDialog({ open, setOpen, modelPath }: ModelSettingsDialogProps) {
	const preference = usePreferenceProvider()
	const { models } = useTranscriptionModels(open)
	const { toggleDiarization, handleStableTimestampsToggle } = useAuxModelToggles()

	const path = modelPath ?? preference.modelPath
	const entry = models.find((model) => model.path === path)
	const pipeline: ModelPipeline = path ? getModelPipelineFromPath(path) : MODEL_PIPELINES.custom
	const name = entry ? modelDisplayName(entry, preference.modelDisplayNames) : path ? (path.split(/[\\/]/).pop() ?? '') : m.selectModel()
	const options = preference.modelOptions
	const setOptions = preference.setModelOptions
	const isWhisper = pipeline.type === 'whisper' || pipeline.type === 'custom'
	// SenseVoice / Hunyuan expose no decoding parameters at all.
	const showParams = pipeline.type !== 'sensevoice' && pipeline.type !== 'hunyuan'

	async function revealModel() {
		if (path) await invoke('open_path', { path })
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl">
				<DialogHeader>
					<DialogTitle>{m.modelSettings()}</DialogTitle>
					<DialogDescription className="truncate">
						{name}
						{path ? ` · ${path}` : ` · ${m.noModelsInstalled()}`}
					</DialogDescription>
				</DialogHeader>

				{!path ? (
					<p className="py-6 text-center text-sm text-muted-foreground">{m.selectModel()}</p>
				) : (
					<div className="space-y-5">
						<div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-sm font-semibold">{name}</span>
								<span className="rounded-md bg-primary/12 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
									{m.engine()}: {pipeline.engine}
								</span>
							</div>
							<div className="flex flex-wrap gap-1.5">
								<Capability label="GPU" supported={pipeline.supportsGpu} />
								<Capability label="VAD" supported={pipeline.supportsVad} />
								<Capability label={m.diarization()} supported={pipeline.supportsDiarization} />
								<Capability label={m.translateToEnglish()} supported={pipeline.supportsTranslation} />
								<Capability label={m.useWordTimestamps()} supported={pipeline.supportsWordTimestamps} />
								<Capability label="Streaming" supported={pipeline.supportsStreaming} />
							</div>
							<Button variant="ghost" size="sm" className="h-8 w-full justify-between px-3" onMouseDown={revealModel}>
								{m.modelFile()} <FolderOpen className="size-3.5" />
							</Button>
						</div>

						{showParams && (
							<>
								<div className="space-y-3">
									<span className="px-1 text-sm font-semibold text-foreground/95">{m.modelOptions()}</span>
									<div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 p-4">
										<div className="space-y-2">
											<Label className="flex items-center gap-1">
												<InfoTooltip text={m.infoThreads()} />
												{m.threads()}
											</Label>
											<Input
												type="number"
												value={options.n_threads}
												onChange={(event) => setOptions({ ...options, n_threads: parseIntOr(event.target.value, 1) })}
											/>
										</div>
										<div className="space-y-2">
											<Label className="flex items-center gap-1">
												<InfoTooltip text={m.infoTemperature()} />
												{m.temperature()}
											</Label>
											<Input
												type="number"
												step={0.1}
												value={options.temperature}
												onChange={(event) => setOptions({ ...options, temperature: parseFloat(event.target.value) || 0 })}
											/>
										</div>
										{isWhisper && (
											<div className="space-y-2">
												<Label className="flex items-center gap-1">
													<InfoTooltip text={m.infoMaxTextCtx()} />
													{m.maxTextCtx()}
												</Label>
												<Input
													type="number"
													step={1}
													value={options.max_text_ctx ?? 0}
													onChange={(event) => setOptions({ ...options, max_text_ctx: parseIntOr(event.target.value, 0) })}
												/>
											</div>
										)}
										<div className="space-y-2">
											<Label className="flex items-center gap-1">
												<InfoTooltip text={m.infoMaxSentenceLen()} />
												{m.maxSentenceLen()}
											</Label>
											<Input
												type="number"
												value={options.max_sentence_len}
												onChange={(event) => setOptions({ ...options, max_sentence_len: parseIntOr(event.target.value, 1) })}
											/>
										</div>
									</div>
								</div>

								{pipeline.supportsTranslation && (
									<div className="space-y-3">
										<span className="px-1 text-sm font-semibold text-foreground/95">{m.translateToEnglish()}</span>
										<div className="space-y-2 rounded-xl border border-border/60 p-4">
											<Label className="flex items-center gap-1">
												<InfoTooltip text={m.infoTranslateToEnglish()} />
												{m.translateToEnglish()}
											</Label>
											<Select value={options.translate} onValueChange={(value) => setOptions({ ...options, translate: value })}>
												<SelectTrigger className="capitalize">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{TRANSLATE_OPTIONS.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{options.translate !== 'none' && (
												<p className="text-xs italic text-muted-foreground">{m.translateWhisperModelNote()}</p>
											)}
										</div>
									</div>
								)}

								{pipeline.supportsWordTimestamps && (
									<div className="space-y-3">
										<span className="px-1 text-sm font-semibold text-foreground/95">{m.useWordTimestamps()}</span>
										<div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-4">
											<span className="flex items-center gap-1 text-sm font-medium">
												<InfoTooltip text={m.infoUseWordTimestamps()} />
												{m.useWordTimestamps()}
											</span>
											<Switch
												checked={Boolean(options.word_timestamps)}
												onCheckedChange={(checked) => setOptions({ ...options, word_timestamps: checked })}
											/>
										</div>
									</div>
								)}

								<div className="space-y-3">
									<span className="px-1 text-sm font-semibold text-foreground/95">{m.samplingStrategy()}</span>
									<div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 p-4">
										<div className="space-y-2">
											<Label className="flex items-center gap-1">
												<InfoTooltip text={m.samplingStrategyInfo()} />
												{m.samplingStrategy()}
											</Label>
											<Select
												value={options.sampling_strategy}
												onValueChange={(value) => setOptions({ ...options, sampling_strategy: value as 'greedy' | 'beam search' })}>
												<SelectTrigger className="capitalize">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{['beam search', 'greedy'].map((strategy) => (
														<SelectItem key={strategy} value={strategy} className="capitalize">
															{strategy}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="space-y-2">
											<Label>{options.sampling_strategy === 'greedy' ? 'Best of' : 'Beam size'}</Label>
											<Input
												type="number"
												step={1}
												value={options.sampling_strategy === 'greedy' ? (options.best_of ?? 5) : (options.beam_size ?? 5)}
												onChange={(event) => {
													const value = parseIntOr(event.target.value, 5)
													if (options.sampling_strategy === 'greedy') setOptions({ ...options, best_of: value })
													else setOptions({ ...options, beam_size: value })
												}}
											/>
										</div>
									</div>
								</div>

								<div className="space-y-3">
									<span className="px-1 text-sm font-semibold text-foreground/95">{m.prompt()}</span>
									<div className="space-y-2 rounded-xl border border-border/60 p-4">
										<Label className="flex items-center gap-1">
											<InfoTooltip text={m.infoPrompt()} />
											{m.prompt()} ({m.leftover()} {1024 - (options?.init_prompt?.length ?? 0)} {m.characters()})
										</Label>
										<Textarea
											value={options?.init_prompt}
											onChange={(event) => setOptions({ ...options, init_prompt: event.target.value.slice(0, 1024) })}
											className="min-h-[80px]"
										/>
									</div>
								</div>
							</>
						)}

						<div className="space-y-3">
							<span className="px-1 text-sm font-semibold text-foreground/95">{m.speakerTiming()}</span>
							<div className="space-y-4 rounded-xl border border-border/60 p-4">
								<div className="flex items-center justify-between gap-3">
									<span className="flex items-center gap-1 text-sm font-medium">
										<InfoTooltip text={m.infoDiarization()} />
										{m.enableDiarization()}
									</span>
									<Switch
										checked={preference.diarizeEnabled}
										onCheckedChange={toggleDiarization}
										disabled={!pipeline.supportsDiarization}
									/>
								</div>
								{!pipeline.supportsDiarization && (
									<p className="text-xs text-muted-foreground">Diariazation not supported by {pipeline.engine} engine</p>
								)}
								<div className="h-px bg-border/45" />
								<div className="flex items-center justify-between gap-3">
									<span className="flex items-center gap-1 text-sm font-medium">
										<InfoTooltip text={m.stableTimestampsInfo()} />
										{m.enableStableTimestamps()}
									</span>
									<Switch
										checked={preference.stableTimestampsEnabled}
										onCheckedChange={handleStableTimestampsToggle}
										disabled={!pipeline.supportsVad}
									/>
								</div>
								{!pipeline.supportsVad && <p className="text-xs text-muted-foreground">VAD not supported by {pipeline.engine} engine</p>}
							</div>
						</div>

						<div className="space-y-3">
							<span className="px-1 text-sm font-semibold text-foreground/95">{m.modelMemory()}</span>
							<div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-4">
								<span className="flex items-center gap-1 text-sm font-medium">
									<InfoTooltip text={`${m.unloadModelAfterInactivityInfo()} ${m.zeroMeansNever()}`} />
									{m.unloadModelAfterInactivity()}
								</span>
								<div className="flex items-center gap-2">
									<Input
										type="number"
										min={0}
										max={1440}
										step={1}
										value={preference.unloadTimeoutMinutes}
										onChange={(event) => {
											const minutes = Number(event.target.value)
											if (Number.isFinite(minutes)) preference.setUnloadTimeoutMinutes(Math.min(1440, Math.max(0, Math.floor(minutes))))
										}}
										className="h-8 w-20 rounded-lg px-2 py-0 text-right"
									/>
									<span className="text-sm text-muted-foreground">{m.minutes()}</span>
								</div>
							</div>
						</div>

						{!showParams && (
							<p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
								{m.modelSettingsNoOptions()} ({pipeline.engine})
							</p>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
