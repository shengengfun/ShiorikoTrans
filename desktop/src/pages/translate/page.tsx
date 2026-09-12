import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { Columns2, Rows3 } from 'lucide-react'
import { toast } from 'sonner'
import Layout from '~/components/layout'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { usePreferenceProvider } from '~/providers/preference'
import { useTranslationSession } from '~/providers/translation'
import { setActivity } from '~/lib/activity'
import { TRANSLATE_LANGUAGES, translateText } from '~/lib/translate'

const TEXT_EXTENSIONS = ['txt', 'srt', 'vtt', 'md', 'json', 'csv', 'html']

function bilingualText(source: string, output: string) {
	const originalLines = source.split('\n')
	const translatedLines = output.split('\n')
	return originalLines.map((line, index) => `${line}\n${translatedLines[index] ?? ''}`).join('\n\n')
}

export default function TranslatePage() {
	const preference = usePreferenceProvider()
	const location = useLocation()
	const { source, setSource, output, setOutput, fileName, setFileName, target, setTarget, viewMode, setViewMode } = useTranslationSession()
	const [busy, setBusy] = useState(false)
	const sourceRef = useRef<HTMLTextAreaElement>(null)
	const outputRef = useRef<HTMLTextAreaElement>(null)
	const syncingRef = useRef(false)

	const llmEnabled = !!preference.translationLlmConfig?.enabled

	// 从“转录”页跳转而来时，预填已转录的文本
	useEffect(() => {
		const state = location.state as { sourceText?: string; fileName?: string } | null
		if (state?.sourceText) {
			setSource(state.sourceText)
			setFileName(state.fileName ?? 'transcription')
			setOutput('')
		}
	}, [location.state, setFileName, setOutput, setSource])

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
		if (!source.trim()) return toast.error('请先选择文件或粘贴内容')
		if (!llmEnabled) return toast.error('请先在 设置 → 翻译 中启用翻译模型')
		setBusy(true)
		setActivity({ phase: 'translating', progress: 0 })
		try {
			const result = await translateText(source, target, preference.translationLlmConfig)
			setOutput(result)
			toast.success('翻译完成')
		} catch (error) {
			console.error(error)
			toast.error(String(error))
		} finally {
			setBusy(false)
			setActivity({ phase: 'idle' })
		}
	}

	async function save() {
		const base = fileName.replace(/\.[^.]+$/, '') || 'translation'
		const filePath = await dialog.save({ defaultPath: `${base}.${target}.txt` })
		if (!filePath) return
		await fs.writeTextFile(filePath, output)
		toast.success('已保存')
	}

	return (
		<Layout>
			<div className="mx-auto flex h-full w-full min-w-0 max-w-6xl flex-col gap-4">
				<div className="app-panel flex flex-wrap items-end gap-3">
						<div className="space-y-2">
							<Label>目标语言</Label>
							<Select value={target} onValueChange={setTarget}>
								<SelectTrigger className="w-44 capitalize"><SelectValue /></SelectTrigger>
								<SelectContent>
									{TRANSLATE_LANGUAGES.map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button variant="outline" onClick={pickFile}>选择字幕/文本文件…</Button>
						<Button onClick={doTranslate} disabled={busy || !llmEnabled}>
							{busy ? '翻译中…' : '翻译'}
						</Button>
						<div className="ml-auto flex items-center gap-1 rounded-lg border border-border/70 bg-muted/45 p-1">
							<Tooltip><TooltipTrigger asChild><Button variant={viewMode === 'side-by-side' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('side-by-side')}><Columns2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>原文译文对照</TooltipContent></Tooltip>
							<Tooltip><TooltipTrigger asChild><Button variant={viewMode === 'bilingual' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('bilingual')}><Rows3 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>双语对照</TooltipContent></Tooltip>
						</div>
					</div>

				{viewMode === 'side-by-side' ? (
					<div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
						<div className="app-panel flex min-h-0 min-w-0 flex-col gap-2">
							<p className="app-kicker">原文 {fileName ? `· ${fileName}` : ''}</p>
						<Textarea
							ref={sourceRef}
							className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm"
							value={source}
							onChange={(event) => setSource(event.target.value)}
							onScroll={(event) => syncScroll(event.currentTarget, outputRef.current)}
							placeholder="粘贴文本，或选择 .txt/.srt/.vtt 文件…"
						/>
					</div>

						<div className="app-panel flex min-h-0 min-w-0 flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<p className="app-kicker">译文</p>
							<Button variant="ghost" size="sm" disabled={!output} onClick={save}>保存…</Button>
						</div>
						<Textarea
							ref={outputRef}
							className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm"
							value={output}
							onChange={(event) => setOutput(event.target.value)}
							onScroll={(event) => syncScroll(event.currentTarget, sourceRef.current)}
							placeholder="翻译结果会显示在这里，可继续编辑"
						/>
					</div>
					</div>
				) : (
					<div className="app-panel flex min-h-0 flex-1 flex-col gap-2">
						<div className="flex items-center justify-between gap-2"><p className="app-kicker">双语对照 {fileName ? `· ${fileName}` : ''}</p><Button variant="ghost" size="sm" disabled={!output} onClick={save}>保存译文…</Button></div>
						<Textarea readOnly className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm leading-6" value={bilingualText(source, output)} placeholder="原文和译文会按段落交替显示在这里" />
					</div>
				)}
			</div>
		</Layout>
	)
}
