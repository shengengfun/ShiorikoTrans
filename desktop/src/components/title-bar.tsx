import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { listen } from '@tauri-apps/api/event'
import { platform } from '@tauri-apps/plugin-os'
import { AlertTriangle, Bot, History, Languages, ListVideo, Minus, Replace, Search, Settings2, Square, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { usePreferenceProvider } from '~/providers/preference'
import { useTranscriptionProvider } from '~/providers/transcription'
import { useTranslationSession } from '~/providers/translation'
import { modelDisplayName, modelNameFromPath, useTranscriptionModels, type ModelEntry } from '~/lib/model-list'
import { useRecentFiles } from '~/lib/use-recent-files'
import { openModelSettings } from '~/lib/app'
import { cn } from '~/lib/style'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './ui/dropdown-menu'

interface TitleBarProps {
	onOpenSettings: (scrollTo?: string) => void
}

export default function TitleBar({ onOpenSettings }: TitleBarProps) {
	const navigate = useNavigate()
	const location = useLocation()
	const prefs = usePreferenceProvider()
	const { segments, setSegments, translatedSegments, setTranslatedSegments, summarizeSegments, setSummarizeSegments } = useTranscriptionProvider()
	const { recent, missing: missingRecents, transcripts, busy: recentsBusy, open: openRecent, remove: removeRecent, clear: clearRecent, prune: pruneRecents } = useRecentFiles()
	const { source, setSource, output, setOutput } = useTranslationSession()
	const [searchOpen, setSearchOpen] = useState(false)
	const [showReplace, setShowReplace] = useState(false)
	const [query, setQuery] = useState('')
	const [replacement, setReplacement] = useState('')
	const searchInputRef = useRef<HTMLInputElement>(null)
	const [isWindows] = useState(() => {
		try {
			return platform() === 'windows'
		} catch {
			return false
		}
	})
	const [isMaximized, setIsMaximized] = useState(false)
	const win = (() => {
		try {
			return getCurrentWebviewWindow()
		} catch {
			return null
		}
	})()

	useEffect(() => {
		if (!win) return
		let unlisten: (() => void) | null = null
		let cancelled = false
		win.isMaximized().then(setIsMaximized).catch(() => {})
		listen('tauri://resize', async () => {
			try {
				setIsMaximized(await win.isMaximized())
			} catch {
				/* ignore */
			}
		})
			.then((fn) => {
				if (!cancelled) unlisten = fn
			})
			.catch(() => {})
		return () => {
			cancelled = true
			unlisten?.()
		}
	}, [win])

	function onWindowDoubleClick(event: React.MouseEvent) {
		if (!isWindows || !win) return
		const target = event.target as HTMLElement
		if (target.hasAttribute('data-tauri-drag-region')) {
			isMaximized ? win.unmaximize() : win.maximize()
		}
	}

	// Load available transcription models for the quick-switcher in the title bar
	const { models } = useTranscriptionModels(prefs.modelPath)

	const displayName = (entry: ModelEntry) => modelDisplayName(entry, prefs.modelDisplayNames)
	const currentModel = models.find((entry) => entry.path === prefs.modelPath)
	const modelLabel = currentModel
		? displayName(currentModel)
		: prefs.modelPath
			? prefs.modelDisplayNames[prefs.modelPath] ?? modelNameFromPath(prefs.modelPath)
			: m.selectModel()
	const searchableText = [
		...(segments?.map((segment) => segment.text) ?? []),
		...(translatedSegments?.map((segment) => segment.text) ?? []),
		...(summarizeSegments?.map((segment) => segment.text) ?? []),
		source,
		output,
	].join('\n')
	const matches = query.trim() ? searchableText.match(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))?.length ?? 0 : 0

	function replaceText(text: string) {
		if (!query) return text
		return text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replacement)
	}

	function replaceAll() {
		if (!query) return
		setSegments((current) => current?.map((segment) => ({ ...segment, text: replaceText(segment.text) })) ?? null)
		setTranslatedSegments((current) => current?.map((segment) => ({ ...segment, text: replaceText(segment.text) })) ?? null)
		setSummarizeSegments((current) => current?.map((segment) => ({ ...segment, text: replaceText(segment.text) })) ?? null)
		setSource((current) => replaceText(current))
		setOutput((current) => replaceText(current))
	}

	useEffect(() => {
		function handleShortcut(event: KeyboardEvent) {
			if (!(event.ctrlKey || event.metaKey) || (event.key.toLowerCase() !== 'f' && event.key.toLowerCase() !== 'h')) return
			event.preventDefault()
			setShowReplace(event.key.toLowerCase() === 'h')
			setSearchOpen(true)
		}
		window.addEventListener('keydown', handleShortcut)
		return () => window.removeEventListener('keydown', handleShortcut)
	}, [])

	useEffect(() => {
		if (!searchOpen) return
		window.requestAnimationFrame(() => searchInputRef.current?.focus())
	}, [searchOpen])

	return (
		<header
			data-tauri-drag-region
			onDoubleClick={onWindowDoubleClick}
			className="flex h-14 shrink-0 select-none items-center gap-1.5 border-b border-border/60 bg-card/80 px-2.5 backdrop-blur">
			<img src="/logo.jpg" alt="" draggable={false} className="h-8 w-8 rounded-full object-cover ring-1 ring-border/60" />
			<span className="me-1 text-[15px] font-semibold tracking-tight">{m.appTitle()}</span>

			<div className="mx-1 flex items-center gap-1 rounded-xl bg-muted/60 p-0.5">
				<Button
					variant="ghost"
					size="sm"
					className={cn('h-8 rounded-lg px-2.5', location.pathname === '/' && 'bg-card text-foreground shadow-xs')}
					onClick={() => navigate('/')}>
					转录
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn('h-8 rounded-lg px-2.5', location.pathname === '/batch' && 'bg-card text-foreground shadow-xs')}
					onClick={() => navigate('/batch')}>
					<ListVideo className="h-4 w-4" />
					批量
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn('h-8 rounded-lg px-2.5', location.pathname === '/translate' && 'bg-card text-foreground shadow-xs')}
					onClick={() => navigate('/translate')}>
					<Languages className="h-4 w-4" />
					翻译
				</Button>
			</div>

			<div data-tauri-drag-region className="min-w-2 flex-1" />

			<Popover open={searchOpen} onOpenChange={setSearchOpen}>
				<PopoverTrigger asChild>
					<Button variant="ghost" size="icon" className="rounded-lg" aria-label={m.searchAndReplace()} title={m.searchAndReplace() + ' (Ctrl+F / Ctrl+H)'}>
						<Search className="h-4 w-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80 space-y-2 p-3">
					<div className="flex items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={m.searchTranscriptPlaceholder()} /><span className="shrink-0 text-xs text-muted-foreground">{matches}</span></div>
					{showReplace && <div className="flex items-center gap-2"><Replace className="h-4 w-4 text-muted-foreground" /><Input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder={m.replaceWith()} /></div>}
					<div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setShowReplace((visible) => !visible)}>{showReplace ? m.hideReplace() : m.replace()}</Button>{showReplace && <Button size="sm" disabled={!query || matches === 0} onClick={replaceAll}>{m.replaceAll()}</Button>}</div>
				</PopoverContent>
			</Popover>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-lg px-2.5 text-sm" title={m.recentFiles()}>
						<History className="h-4 w-4" />
						<span className="hidden sm:inline">{m.recentFiles()}</span>
						{recent.length > 0 && (
							<span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] font-semibold text-primary">
								{recent.length}
							</span>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[22rem] rounded-xl border-border/75 bg-popover/98 p-1.5 shadow-lg">
					<div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
						<span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.recentFiles()}</span>
						{missingRecents.size > 0 && (
							<button
								type="button"
								onClick={() => void pruneRecents()}
								className="rounded text-[11px] font-medium text-amber-500 underline-offset-2 hover:underline">
								{m.removeMissingRecents({ count: String(missingRecents.size) })}
							</button>
						)}
					</div>
					{recent.length === 0 ? (
						<p className="px-2.5 py-4 text-center text-sm text-muted-foreground">{m.noRecentFiles()}</p>
					) : (
						recent.slice(0, 10).map((item) => {
							const isMissing = missingRecents.has(item.path)
							const transcript = transcripts[item.path]
							return (
								<DropdownMenuItem
									key={item.path}
									disabled={recentsBusy}
									onClick={() => void openRecent(item)}
									className="group flex items-start gap-2 rounded-md px-2.5 py-2 text-sm">
									{isMissing ? (
										<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
									) : (
										<ListVideo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									)}
									<span className="min-w-0 flex-1">
										<span className="flex items-center gap-1.5">
											<span className={cn('truncate font-medium', isMissing && !transcript && 'text-muted-foreground line-through')}>{item.name}</span>
											{transcript ? (
												<span className="shrink-0 rounded bg-primary/12 px-1 py-0.5 text-[10px] font-medium text-primary">
													{m.recentTranscriptSegments({ count: transcript.segments.toLocaleString() })}
												</span>
											) : (
												<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{m.recentFileOnly()}</span>
											)}
										</span>
											<span className="mt-0.5 block truncate font-mono text-[10.5px] font-normal text-muted-foreground/75" title={item.path}>
												{isMissing ? (transcript ? m.recentSourceMissingHint() : m.recentFileMissingHint()) : item.path}
											</span>
									</span>
									<span className="mt-0.5 shrink-0 font-mono text-[10.5px] text-muted-foreground">{new Date(item.ts).toLocaleDateString()}</span>
									<button
										type="button"
										aria-label={m.remove()}
										title={m.remove()}
										onPointerDown={(event) => event.stopPropagation()}
										onClick={(event) => {
											event.preventDefault()
											event.stopPropagation()
											removeRecent(item.path)
										}}
										className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100">
										<X className="h-3.5 w-3.5" />
									</button>
								</DropdownMenuItem>
							)
						})
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem disabled={recent.length === 0} onClick={clearRecent} className="rounded-md text-destructive">
						{m.clearRecentFiles()}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="h-9 max-w-56 gap-1.5 rounded-lg px-2.5 text-sm"
						title={m.selectModel()}>
						<Bot className="h-4 w-4 shrink-0" />
						<span className="truncate">{modelLabel}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-80 rounded-xl border-border/75 bg-popover/98 p-1.5 shadow-lg">
					<DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{m.selectModel()}
					</DropdownMenuLabel>
					{models.length === 0 ? (
						<p className="px-2.5 py-4 text-center text-sm text-muted-foreground">No models found</p>
					) : (
						<div className="max-h-72 overflow-y-auto">
							{models.map((mdl) => {
								const active = prefs.modelPath === mdl.path
								return (
									<DropdownMenuItem
										key={mdl.path}
										onClick={() => prefs.setModelPath(mdl.path)}
										className={cn('flex h-9 items-center gap-2 rounded-md px-2.5 text-sm', active && 'bg-primary/10 text-primary')}>
										<span className="min-w-0 flex-1 truncate" title={mdl.path}>
											{displayName(mdl)}
										</span>
										{mdl.is_dir && mdl.file && (
											<span className="max-w-28 shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={mdl.file}>
												{mdl.file}
											</span>
										)}
										<button
											type="button"
											aria-label={m.modelSettings()}
											title={m.modelSettings()}
											onPointerDown={(event) => event.stopPropagation()}
											onClick={(event) => {
												event.stopPropagation()
												prefs.setModelPath(mdl.path)
												openModelSettings(mdl.path)
											}}
											className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
											<Settings2 className="h-3.5 w-3.5" />
										</button>
									</DropdownMenuItem>
								)
							})}
						</div>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				variant="ghost"
				size="icon"
				className="rounded-lg"
				aria-label={m.settings()}
				onClick={() => onOpenSettings()}>
				<Settings2 className="h-4.5 w-4.5" />
			</Button>

			{isWindows && (
				<div dir="ltr" className="ml-1 flex items-center gap-0.5">
					<button
						type="button"
						aria-label="Minimize"
						onClick={() => win?.minimize()}
						className="flex h-9 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
						<Minus className="h-4 w-4" />
					</button>
					<button
						type="button"
						aria-label={isMaximized ? 'Restore' : 'Maximize'}
						onClick={() => (isMaximized ? win?.unmaximize() : win?.maximize())}
						className="flex h-9 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
						{isMaximized ? <Square className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5 opacity-60" />}
					</button>
					<button
						type="button"
						aria-label="Close"
						onClick={() => win?.close()}
						className="flex h-9 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground">
						<X className="h-4 w-4" />
					</button>
				</div>
			)}
		</header>
	)
}
