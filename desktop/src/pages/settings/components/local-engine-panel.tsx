import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Download } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { baseUrlForPort, getLlamaStatus, installLlamaServer, resolveLocalModel, startLlamaServer, stopLlamaServer, type LlamaStatus } from '~/lib/local-engine'
import { Button } from '~/components/ui/button'
import { SettingPanel, StateBadge } from './kit'
import type { SettingId } from '../registry'

/**
 * The built-in engine panel.
 *
 * The app ships no inference server, so it downloads a llama.cpp build on
 * demand and starts `llama-server` for the selected model. Both the summary and
 * the translation settings use this panel — previously the UI only printed a
 * command for the user to run in a terminal, which is why the local engines
 * were effectively unusable.
 */
export function LocalEnginePanel({
	id,
	title,
	hint,
	model,
	onBaseUrl,
	refreshKey,
}: {
	id: SettingId
	title: string
	hint: string
	model: string | undefined
	onBaseUrl: (url: string) => void
	/** Bump to re-read the status (e.g. after a model finished downloading). */
	refreshKey?: unknown
}) {
	const [runtime, setRuntime] = useState<LlamaStatus | null>(null)
	const [modelPath, setModelPath] = useState<string | null>(null)
	const [busy, setBusy] = useState<'install' | 'start' | 'stop' | null>(null)

	async function refresh() {
		try {
			const [status, path] = await Promise.all([getLlamaStatus(), resolveLocalModel(model)])
			setRuntime(status)
			setModelPath(path)
		} catch (error) {
			console.error('failed to read the local engine status:', error)
		}
	}

	useEffect(() => {
		refresh()
	}, [model, refreshKey])

	async function run(action: 'install' | 'start' | 'stop') {
		setBusy(action)
		try {
			if (action === 'install') await installLlamaServer()
			if (action === 'start' && modelPath) {
				const port = await startLlamaServer(modelPath)
				onBaseUrl(baseUrlForPort(port))
			}
			if (action === 'stop') await stopLlamaServer()
		} catch (error) {
			console.error('local engine action failed:', error)
			toast.error(String(error))
		} finally {
			setBusy(null)
			await refresh()
		}
	}

	const state = runtime?.running
		? { tone: 'primary' as const, label: m.translationLocalServiceRunning({ port: String(runtime.port ?? '') }) }
		: runtime?.installed
			? { tone: 'muted' as const, label: m.translationLocalRuntimeReady() }
			: { tone: 'warning' as const, label: m.translationLocalRuntimeMissing() }

	return (
		<SettingPanel id={id} className="space-y-2.5">
			<div className="text-sm font-medium">{title}</div>
			<div className="flex flex-wrap items-center gap-2">
				<StateBadge tone={state.tone}>{state.label}</StateBadge>
				{!runtime?.installed && (
					<Button size="sm" className="h-8 gap-1.5" disabled={busy !== null} onClick={() => run('install')}>
						<Download className="h-3.5 w-3.5" />
						{busy === 'install' ? m.downloadingModel() : m.translationLocalDownloadRuntime()}
					</Button>
				)}
				{runtime?.installed && !runtime.running && modelPath && (
					<Button size="sm" className="h-8" disabled={busy !== null} onClick={() => run('start')}>
						{busy === 'start' ? m.translationLocalServiceStarting() : m.translationLocalStart()}
					</Button>
				)}
				{runtime?.running && (
					<Button size="sm" variant="outline" className="h-8" disabled={busy !== null} onClick={() => run('stop')}>
						{m.translationLocalStop()}
					</Button>
				)}
			</div>
			<p className="text-[11px] text-muted-foreground">{runtime?.installed && !modelPath ? m.translationLocalModelMissing() : hint}</p>
		</SettingPanel>
	)
}
