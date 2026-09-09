import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { subscribeActivity, type ActivityState } from '~/lib/activity'
import { cn } from '~/lib/style'

export default function StatusBar() {
	const [activity, setActivity] = useState<ActivityState | null>(null)
	const [stats, setStats] = useState<[number, number] | null>(null)

	useEffect(() => subscribeActivity(setActivity), [])

	useEffect(() => {
		let cancelled = false
		let timer: number | undefined
		async function poll() {
			try {
				const value = await invoke<[number, number]>('get_system_stats')
				if (!cancelled) setStats(value)
			} catch {
				/* ignore in non-Tauri contexts */
			}
			if (!cancelled) timer = window.setTimeout(poll, 1200)
		}
		poll()
		return () => {
			cancelled = true
			if (timer) window.clearTimeout(timer)
		}
	}, [])

	const busy = !!activity && activity.phase !== 'idle'
	const pct = activity && typeof activity.progress === 'number' ? Math.max(0, Math.min(100, activity.progress)) : null

	return (
		<footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/60 bg-card/75 px-3 text-[11px] text-muted-foreground">
			<span className="flex items-center gap-1.5">
				<span className={cn('h-2 w-2 rounded-full', busy ? 'animate-pulse bg-primary' : 'bg-success')} />
				<span>{activity?.phase === 'transcribing' ? 'Transcribing…' : 'Ready'}</span>
			</span>
			{pct !== null && (
				<span className="flex items-center gap-2">
					<div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
						<div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
					</div>
					<span className="tabular-nums">{Math.round(pct)}%</span>
				</span>
			)}
			<span className="ms-auto flex items-center gap-3 font-mono tabular-nums">
				{stats && <span>CPU {Math.round(stats[0])}%</span>}
				{stats && <span>MEM {Math.round(stats[1])}%</span>}
			</span>
		</footer>
	)
}
