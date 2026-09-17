import * as dialog from '@tauri-apps/plugin-dialog'
import * as fs from '@tauri-apps/plugin-fs'
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { AlignRight, Check, Copy, Download, Printer } from 'lucide-react'
import { Segment, asCsv, asJson, asSrt, asText, asVtt } from '~/lib/transcript'
import { NamedPath } from '~/lib/types'
import { openPath } from '~/lib/app'
import { cn } from '~/lib/style'
import { TextFormat, formatExtensions } from './format-select'
import { usePreferenceProvider } from '~/providers/preference'
import HTMLView from './html-view'
import { toast } from 'sonner'
import { invoke } from '@tauri-apps/api/core'
import * as clipboard from '@tauri-apps/plugin-clipboard-manager'
import { path } from '@tauri-apps/api'
import Markdown from 'react-markdown'
import { Button } from '~/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'

/** Serialises segments in the selected format. */
function buildDocument(format: TextFormat, segments: Segment[], speakerLabel: string | null) {
	if (format === 'vtt') return asVtt(segments, speakerLabel)
	if (format === 'srt') return asSrt(segments, speakerLabel)
	if (format === 'json') return asJson(segments)
	if (format === 'csv') return asCsv(segments)
	return asText(segments, speakerLabel)
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false)
	const [info, setInfo] = useState(m.copy())
	const resetTimerRef = useRef<number | null>(null)

	useEffect(() => {
		return () => {
			if (resetTimerRef.current) {
				window.clearTimeout(resetTimerRef.current)
			}
		}
	}, [])

	function onCopy() {
		clipboard.writeText(text)
		setCopied(true)
		setInfo(m.copied())
		if (resetTimerRef.current) {
			window.clearTimeout(resetTimerRef.current)
		}
		resetTimerRef.current = window.setTimeout(() => {
			setCopied(false)
			setInfo(m.copy())
			resetTimerRef.current = null
		}, 1000)
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="ghost" size="icon" onMouseDown={onCopy}>
					{copied ? <Check className="h-5 w-5" strokeWidth={2.3} /> : <Copy className="h-5 w-5" strokeWidth={2.1} />}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{info}</TooltipContent>
		</Tooltip>
	)
}

export default function TextArea({
	segments,
	readonly,
	placeholder,
	file,
	textFormat,
	setTextFormat,
	bilingual,
}: {
	segments: Segment[] | null
	readonly: boolean
	placeholder?: string
	/** Source file; may be unknown (e.g. the selection was cleared) — saving still works. */
	file?: NamedPath
	textFormat: TextFormat
	setTextFormat: Dispatch<SetStateAction<TextFormat>>
	bilingual?: Segment[] | null
}) {
	const preference = usePreferenceProvider()
	const [text, setText] = useState('')

	const speakerLabel = preference.speakerLabels ? m.speakerPrefix() : null

	// Bilingual (原文 + 译文双行) support. Falls back to plain text otherwise.
	const bilingualActive = !!bilingual && !!segments
	const bilingualMap = new Map((bilingual ?? []).map((t) => [t.start, t.text] as const))
	const displayText = bilingualActive
		? (segments?.map((s) => `${s.text}\n${bilingualMap.get(s.start) ?? ''}`).join('\n\n') ?? text)
		: text
	useEffect(() => {
		if (!segments) {
			setText('')
			return
		}
		// Segments stream in one by one; rebuilding the whole document per segment
		// is O(n²) and froze the UI on long files. Debounce the rebuild instead.
		const timer = window.setTimeout(() => {
			setText(buildDocument(textFormat, segments, speakerLabel))
		}, 150)
		return () => window.clearTimeout(timer)
	}, [textFormat, segments, speakerLabel])

	async function download(textToSave: string, format: TextFormat, srcFile: NamedPath | null) {
		if (format === 'html') {
			textToSave = document.querySelector('.html')!.outerHTML.replace('contenteditable="true"', 'contenteditable="false"')
		}
		if (format === 'pdf') {
			window.print()
			return
		}

		// The textarea content is rebuilt on a debounce because segments stream in
		// during transcription; saving in that window would write an empty file, so
		// rebuild from the segments whenever the cached text is still missing.
		if ((format === 'normal' || format === 'srt' || format === 'vtt' || format === 'json' || format === 'csv' || format === 'md') && !textToSave?.trim() && segments?.length) {
			textToSave = buildDocument(format, segments, speakerLabel)
		}

		const ext = formatExtensions[format].slice(1)
		// The source file can be unknown (selection cleared after navigating away),
		// in which case the dialog just opens with a sensible default name.
		let defaultPath: NamedPath | null = null
		if (srcFile?.path) {
			try {
				defaultPath = await invoke<NamedPath>('get_save_path', { srcPath: srcFile.path, targetExt: ext })
			} catch (error) {
				console.error('failed to resolve default save path:', error)
			}
		}
		const filePath = await dialog.save({
			filters: [{ name: '', extensions: [ext] }],
			canCreateDirectories: true,
			defaultPath: defaultPath?.path ?? `transcript.${ext}`,
		})

		if (!filePath) return

		if (format === 'docx') {
			const fileName = await path.basename(filePath)
			// `docx` is a large dependency and only needed for this export format.
			const { toDocx } = await import('~/lib/docx')
			const doc = await toDocx(fileName, segments ?? [], preference.textAreaDirection, speakerLabel)
			const arrayBuffer = await doc.arrayBuffer()
			await fs.writeFile(filePath, new Uint8Array(arrayBuffer))
		} else {
			await fs.writeTextFile(filePath, textToSave)
		}

		toast.success(m.saveSuccess(), {
			description: defaultPath?.name,
			position: 'bottom-center',
			action: { label: m.findHere(), onClick: () => openPath({ name: '', path: filePath }) },
		})
	}

	return (
		<div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
			<div className="flex w-full shrink-0 flex-wrap items-center gap-1 rounded-tl-lg rounded-tr-lg bg-muted p-1">
				<CopyButton text={displayText} />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="icon" onMouseDown={() => download(displayText, textFormat, file ?? null)}>
							<Download className="h-5 w-5" strokeWidth={2.1} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{m.saveTranscript()}</TooltipContent>
				</Tooltip>

				{['html', 'pdf'].includes(textFormat) && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button variant="ghost" size="icon" onMouseDown={() => window.print()}>
								<Printer className="h-5 w-5" strokeWidth={2.1} />
							</Button>
						</TooltipTrigger>
						<TooltipContent>{m.printTooltip()}</TooltipContent>
					</Tooltip>
				)}

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								preference.textAreaDirection === 'rtl' ? 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary' : '',
							)}
							onMouseDown={() => preference.setTextAreaDirection(preference.textAreaDirection === 'rtl' ? 'ltr' : 'rtl')}>
							<AlignRight className="h-5 w-5" strokeWidth={2.1} />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{m.rightAlignment()}</TooltipContent>
				</Tooltip>

				<div className="ms-auto me-1 min-w-[98px]">
					<Select value={textFormat} onValueChange={(value) => setTextFormat(value as TextFormat)}>
						<SelectTrigger className="h-9 w-[98px] px-2 text-sm">
							<SelectValue placeholder={m.modeText()} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="normal">{m.modeText()}</SelectItem>
							<SelectItem value="html">html</SelectItem>
							<SelectItem value="pdf">pdf</SelectItem>
							<SelectItem value="docx">docx</SelectItem>
							<SelectItem value="srt">srt</SelectItem>
							<SelectItem value="vtt">vtt</SelectItem>
							<SelectItem value="json">json</SelectItem>
							<SelectItem value="csv">csv</SelectItem>
							<SelectItem value="md">md</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</div>

			{bilingualActive ? (
				<div
					contentEditable
					suppressContentEditableWarning
					dir={preference.textAreaDirection}
					className="transcript-editor min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card px-3 py-2 text-lg leading-relaxed focus:outline-none">
					{(segments ?? []).map((segment) => {
						const translated = bilingualMap.get(segment.start)
						return (
							<div key={`${segment.start}-${segment.stop}`} className="mb-2">
								<div className="text-muted-foreground">{segment.text}</div>
								{translated ? <div className="text-primary">{translated}</div> : null}
							</div>
						)
					})}
				</div>
			) : ['html', 'pdf', 'docx'].includes(textFormat) ? (
				<div className="transcript-editor min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card">
					<HTMLView preference={preference} segments={segments ?? []} file={file ?? { name: 'transcript', path: 'transcript' }} />
				</div>
			) : textFormat === 'md' ? (
				<div
					dir={preference.textAreaDirection}
					className="transcript-editor prose prose-sm dark:prose-invert min-h-0 max-w-none flex-1 overflow-x-hidden overflow-y-auto rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card px-4 py-3">
					<Markdown>{text}</Markdown>
				</div>
			) : (
				<textarea
					placeholder={placeholder}
					readOnly={readonly}
					autoCorrect="off"
					spellCheck={false}
					onChange={(e) => setText(e.target.value)}
					value={text}
					dir={preference.textAreaDirection}
					className={cn(
						'transcript-editor min-h-0 flex-1 resize-none overflow-x-hidden overflow-y-scroll rounded-bl-lg rounded-br-lg border-x border-b border-input/70 bg-card px-3 py-2 text-lg leading-relaxed focus:outline-none',
					)}
				/>
			)}
		</div>
	)
}
