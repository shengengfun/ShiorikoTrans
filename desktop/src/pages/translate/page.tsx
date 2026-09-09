import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { toast } from 'sonner'
import Layout from '~/components/layout'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { usePreferenceProvider } from '~/providers/preference'
import { setActivity } from '~/lib/activity'
import { TRANSLATE_LANGUAGES, translateText } from '~/lib/translate'

const TEXT_EXTENSIONS = ['txt', 'srt', 'vtt', 'md', 'json', 'csv', 'html']

export default function TranslatePage() {
	const preference = usePreferenceProvider()
	const location = useLocation()
	const [target, setTarget] = useState('zh')
	const [source, setSource] = useState('')
	const [output, setOutput] = useState('')
	const [fileName, setFileName] = useState('')
	const [busy, setBusy] = useState(false)

	const llmEnabled = !!preference.llmConfig?.enabled

	// 从“转录”页跳转而来时，预填已转录的文本
	useEffect(() => {
		const state = location.state as { sourceText?: string; fileName?: string } | null
		if (state?.sourceText) {
			setSource(state.sourceText)
			setFileName(state.fileName ?? 'transcription')
			setOutput('')
		}
	}, [location.state])

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
		if (!source.trim()) {
			toast.error('请先选择文件或粘贴内容')
			return
		}
		if (!llmEnabled) {
			toast.error('请先在 设置 → LLM 中启用（推荐 Ollama 本地）')
			return
		}
		setBusy(true)
		setActivity({ phase: 'translating', progress: 0 })
		try {
			const result = await translateText(source, target, preference.llmConfig)
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
			<div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-5">
				<div className="app-panel space-y-4">
					<div>
						<p className="app-kicker">翻译</p>
						<h2 className="text-2xl font-semibold">Translation</h2>
					</div>

					<div className="flex flex-wrap items-end gap-3">
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
						{!llmEnabled && (
							<p className="text-sm text-muted-foreground">需先在设置启用 LLM（本地建议 Ollama）</p>
						)}
					</div>
				</div>

				<div className="grid w-full min-w-0 gap-5 lg:grid-cols-2">
					<div className="app-panel flex min-w-0 flex-col gap-2">
						<div className="flex items-center justify-between">
							<p className="app-kicker">原文 {fileName ? `· ${fileName}` : ''}</p>
						</div>
						<Textarea
							className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm"
							value={source}
							onChange={(event) => setSource(event.target.value)}
							placeholder="粘贴文本，或选择 .txt/.srt/.vtt 文件…"
						/>
					</div>

					<div className="app-panel flex min-w-0 flex-col gap-2">
						<div className="flex items-center justify-between gap-2">
							<p className="app-kicker">译文</p>
							<Button variant="ghost" size="sm" disabled={!output} onClick={save}>保存…</Button>
						</div>
						<Textarea
							className="h-[55vh] min-h-[300px] flex-1 resize-none font-mono text-sm"
							value={output}
							onChange={(event) => setOutput(event.target.value)}
							placeholder="翻译结果会显示在这里，可继续编辑"
						/>
					</div>
				</div>
			</div>
		</Layout>
	)
}
