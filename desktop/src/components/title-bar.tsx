import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { listen } from '@tauri-apps/api/event'
import { platform } from '@tauri-apps/plugin-os'
import { Bot, History, Languages, ListVideo, Minus, Settings2, Square, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { usePreferenceProvider, type RecentFile } from '~/providers/preference'
import { useFilesContext } from '~/providers/files-provider'
import { modelDisplayName, modelNameFromPath, useTranscriptionModels, type ModelEntry } from '~/lib/model-list'
import { openModelSettings } from '~/lib/app'
import { cn } from '~/lib/style'
import { Button } from './ui/button'
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
	const { setFiles } = useFilesContext()
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

	function reopenFile(recent: RecentFile) {
		prefs.setHomeTab('file')
		if (location.pathname !== '/') navigate('/')
		// Let the Home page's location-effect finish clearing state first.
		window.setTimeout(() => setFiles([{ name: recent.name, path: recent.path }]), 120)
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
	const recent = [...prefs.recentFiles].sort((a, b) => b.ts - a.ts)

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

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-lg px-2.5 text-sm">
						<History className="h-4 w-4" />
						<span className="hidden sm:inline">Recent</span>
						{recent.length > 0 && (
							<span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary/15 px-1 text-[11px] font-semibold text-primary">
								{recent.length}
							</span>
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-72 rounded-xl border-border/75 bg-popover/98 p-1.5 shadow-lg">
					<DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{m.files()} · Recent
					</DropdownMenuLabel>
					{recent.length === 0 ? (
						<p className="px-2.5 py-4 text-center text-sm text-muted-foreground">No recent transcripts yet</p>
					) : (
						recent.slice(0, 10).map((item) => (
							<DropdownMenuItem
								key={item.path}
								onClick={() => reopenFile(item)}
								className="flex h-10 items-center gap-2 rounded-md px-2.5 text-sm">
								<span className="min-w-0 flex-1 truncate" title={item.path}>
									{item.name}
								</span>
								<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
									{new Date(item.ts).toLocaleDateString()}
								</span>
							</DropdownMenuItem>
						))
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => prefs.setRecentFiles([])} className="rounded-md text-destructive">
						Clear history
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
