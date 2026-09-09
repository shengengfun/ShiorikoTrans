import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { listen } from '@tauri-apps/api/event'
import { platform } from '@tauri-apps/plugin-os'
import { Bot, History, ListVideo, Minus, Settings2, Square, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { usePreferenceProvider, type RecentFile } from '~/providers/preference'
import { useFilesContext } from '~/providers/files-provider'
import { getFriendlyModelName } from '~/lib/model'
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

	const modelBase = prefs.modelPath?.split(/[\\/]/).pop() || ''
	const modelLabel = modelBase ? getFriendlyModelName(modelBase) : m.selectModel()
	const recent = [...prefs.recentFiles].sort((a, b) => b.ts - a.ts)

	return (
		<header
			data-tauri-drag-region
			onDoubleClick={onWindowDoubleClick}
			className="flex h-14 shrink-0 select-none items-center gap-1.5 border-b border-border/60 bg-card/80 px-2.5 backdrop-blur">
			<img src="/shiorikotrans.svg" alt="" draggable={false} className="h-7 w-7 rounded-lg" />
			<span className="me-1 text-[15px] font-semibold tracking-tight">{m.appTitle()}</span>

			<div className="mx-1 flex items-center gap-1 rounded-xl bg-muted/60 p-0.5">
				<Button
					variant="ghost"
					size="sm"
					className={cn('h-8 rounded-lg px-2.5', location.pathname === '/' && 'bg-card text-foreground shadow-xs')}
					onClick={() => navigate('/')}>
					{m.transcribe()}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn('h-8 rounded-lg px-2.5', location.pathname === '/batch' && 'bg-card text-foreground shadow-xs')}
					onClick={() => navigate('/batch')}>
					<ListVideo className="h-4 w-4" />
					{m.batch()}
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

			<Button
				variant="ghost"
				size="sm"
				className="h-9 gap-1.5 rounded-lg px-2.5 text-sm"
				title={m.selectModel()}
				onClick={() => onOpenSettings('models')}>
				<Bot className="h-4 w-4" />
				<span className="hidden max-w-40 truncate lg:inline">{modelLabel}</span>
			</Button>

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
