import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { Columns2, Cpu, Rows3, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import successSound from '~/assets/success.mp3'
import Layout from '~/components/layout'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { m } from '~/paraglide/messages.js'
import { usePreferenceProvider } from '~/providers/preference'
import { useTranslationSession } from '~/providers/translation'
import { setActivity } from '~/lib/activity'
import { TRANSLATE_LANGUAGES, isLocalEndpoint, languageName, translateLongText } from '~/lib/translate'
import { TRANSLATE_MODELS, isTranslateModelInstalled } from '~/lib/translate-models'

const TEXT_EXTENSIONS = ['txt', 'srt', 'vtt', 'md', 'json', 'csv', 'html']

function bilingualText(source: string, output: string) {
	const originalLines = source.split('\n')
	const translatedLines = output.split('\n')
	return originalLines.map((line, index) => `${line}\n${translatedLines[index] ?? ''}`).join('\n\n')
}

export default function TranslatePage() {
	const preference = usePreferenceProvider()
	const location = useLocation()
	const navigate = useNavigate()
	const { source, setSource, output, setOutput, fileName, setFileName, target, setTarget, viewMode, setViewMode } = useTranslationSession()
	const [busy, setBusy] = useState(false)
	const [progress, setProgress] = useState(0)
	const [installedModels, setInstalledModels] = useState<string[]>([])
	const sourceRef = useRef<HTMLTextAreaElement>(null)
	const outputRef = useRef<HTMLTextAreaElement>(null)
	const syncingRef = useRef(false)

	const config = preference.translationLlmConfig
	const llmEnabled = !!config?.enabled

	// 从“转录”页跳转而来时，预填已转录的文本
	useEffect(() => {
		const state = location.state as { sourceText?: string; fileName?: string } | null
		if (state?.sourceText) {
			setSource(state.sourceText)
			setFileName(state.fileName ?? 'transcription')
			setOutput('')
		}
	}, [location.state, setFileName, setOutput, setSource])

	// 只有已下载的本地模型才会出现在这个下拉里（外加当前配置的模型）
	useEffect(() => {
		let cancelled = false
		Promise.all(TRANSLATE_MODELS.map(async (entry) => ((await isTranslateModelInstalled(entry)) ? entry.filename : null))).then((names) => {
			if (cancelled) return
			const present = names.filter((name): name is string => !!name)
			setInstalledModels(config?.model && !present.includes(config.model) ? [config.model, ...present] : present)
		})
		return () => {
			cancelled = true
		}
	}, [config?.model])

	function syncScroll(from: HTMLTextAreaElement, to: HTMLTextAreaElement | null) {
		if (!to || syncingRef.current) return
		syncingRef.current = true
		const ratio = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight)
		to.scrollTop = ratio * Math.max(0, to.scrollHeight - to.clientHeight)
		window.requestAnimationFrame(() => {
			syncingRef.current = false
		})
	}

	async function pickFile() {
		const file = await dialog.open({ multiple: false, directory: false, filters: [{ name: 'Text / Subtitle', extensions: TEXT_EXTENSIONS }] })
		if (typeof file !== 'string') return
		try {
			const content = await fs.readTextFile(file)
			setSource(content)
			setOutput('')
			setFileName(file.split(/[\\/]/).pop() ?? file)
		} catch (error) {
			console.error(error)
			toast.error(String(error))
		}
	}

	async function doTranslate() {
		if (!source.trim()) return toast.error(m.needSourceText() as string)
		if (!llmEnabled) return toast.error(m.needEnableTranslation() as string)
		setBusy(true)
		setProgress(0)
		setActivity({ phase: 'translating', progress: 0 })
		try {
			const result = await translateLongText(
				source,
				target,
				config,
				(done, total) => {
					const percent = total ? (done / total) * 100 : 100
					setProgress(percent)
					setActivity({ phase: 'translating', progress: percent })
				},
				preference.translateChunkSize,
			)
			setOutput(result)
			toast.success(m.translationDone())
			if (preference.soundOnTranslateFinish) new Audio(successSound).play()
		} catch (error) {
			console.error(error)
			toast.error(String(error))
		} finally {
			setBusy(false)
			setProgress(0)
			setActivity({ phase: 'idle' })
		}
	}

	async function save() {
		const base = fileName.replace(/\.[^.]+$/, '') || 'translation'
		const ext = viewMode === 'bilingual' ? 'txt' : 'txt'
		const filePath = await dialog.save({ defaultPath: `${base}.${target}.${ext}`, filters: [{ name: '', extensions: [ext] }], canCreateDirectories: true })
		if (!filePath) return
		await fs.writeTextFile(filePath, viewMode === 'bilingual' ? bilingualText(source, output) : output)
		toast.success(m.saveSuccess())
	}

	return (
		<Layout>
			<div className="mx-auto flex h-full w-full min-w-0 max-w-6xl flex-col gap-4">
				<div className="app-panel flex flex-wrap items-end gap-3">
					<div className="space-y-2">
						<Label>{m.defaultTarget()}</Label>
						<Select value={target} onValueChange={setTarget}>
							<SelectTrigger className="w-44">
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
					</div>
					<div className="space-y-2">
						<Label className="flex items-center gap-1.5">
							<Cpu className="h-3.5 w-3.5" />
							{m.modelName()}
						</Label>
						<div className="flex items-center gap-1.5">
							<Select value={config?.model ?? ''} onValueChange={(model) => preference.setTranslationLlmConfig({ ...config, model })}>
								<SelectTrigger className="w-64">
									<SelectValue placeholder={m.modelName()} />
								</SelectTrigger>
								<SelectContent>
									{installedModels.map((name) => (
										<SelectItem key={name} value={name}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button variant="outline" size="icon" onClick={() => navigate('/settings?scrollTo=translation')}>
										<Settings2 className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>{m.translationEngine()}</TooltipContent>
							</Tooltip>
						</div>
					</div>
					<Button variant="outline" onClick={pickFile}>
						{m.chooseTextFile()}
					</Button>
					<Button onClick={doTranslate} disabled={busy || !llmEnabled}>
						{busy ? m.translating() : m.translate()}
					</Button>
					<div className="ml-auto flex items-center gap-1 rounded-lg border border-border/70 bg-muted/45 p-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={viewMode === 'side-by-side' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('side-by-side')}>
									<Columns2 className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{m.translateSideBySide()}</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant={viewMode === 'bilingual' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('bilingual')}>
									<Rows3 className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{m.translateBilingual()}</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
					<span className={isLocalEndpoint(config) ? 'text-primary' : undefined}>
						{m.currentEngine()}: {isLocalEndpoint(config) ? m.engineLocal() : config?.platform === 'ollama' ? 'Ollama' : config?.platform === 'claude' ? 'Claude' : 'OpenAI'}
					</span>
					<span>·</span>
					<span>{languageName(target)}</span>
					{!llmEnabled && <span className="text-amber-500">· {m.needEnableTranslation()}</span>}
					{busy && progress > 0 && <span className="text-primary">· {Math.round(progress)}%</span>}
				</div>

				{viewMode === 'side-by-side' ? (
					<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
						<div className="app-panel flex min-h-0 min-w-0 flex-col gap-2">
							<p className="app-kicker">
								{m.translateSource()} {fileName ? `· ${fileName}` : ''}
							</p>
							<Textarea
								ref={sourceRef}
								className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm"
								value={source}
								onChange={(event) => setSource(event.target.value)}
								onScroll={(event) => syncScroll(event.currentTarget, outputRef.current)}
								placeholder={m.pasteText()}
							/>
						</div>

						<div className="app-panel flex min-h-0 min-w-0 flex-col gap-2">
							<div className="flex items-center justify-between gap-2">
								<p className="app-kicker">{m.translateOutput()}</p>
								<Button variant="ghost" size="sm" disabled={!output} onClick={save}>
									{m.saveTranslation()}
								</Button>
							</div>
							<Textarea
								ref={outputRef}
								className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm"
								value={output}
								onChange={(event) => setOutput(event.target.value)}
								onScroll={(event) => syncScroll(event.currentTarget, sourceRef.current)}
								placeholder={m.translationPlaceholder()}
							/>
						</div>
					</div>
				) : (
					<div className="app-panel flex min-h-0 flex-1 flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<p className="app-kicker">
								{m.translateBilingual()} {fileName ? `· ${fileName}` : ''}
							</p>
							<Button variant="ghost" size="sm" disabled={!output} onClick={save}>
								{m.saveTranslation()}
							</Button>
						</div>
						<Textarea
							readOnly
							className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm leading-6"
							value={bilingualText(source, output)}
							placeholder={m.bilingualPlaceholder()}
						/>
					</div>
				)}
			</div>
		</Layout>
	)
}
