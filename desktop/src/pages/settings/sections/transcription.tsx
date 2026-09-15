import { ReactNode, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import LanguageInput from '~/components/language-input'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { m } from '~/paraglide/messages.js'
import { useAuxModelToggles } from '~/lib/aux-model-toggles'
import { getFfmpegStatus, installFfmpeg, type FfmpegStatus } from '~/lib/ffmpeg'
import { useModelDownload } from '~/lib/model-download'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { SectionCard } from './shared'

/**
 * Settings for the transcription pipeline.
 *
 * The speaker options live here (and not only inside the per-model dialog) so
 * they are discoverable: diarization, the `[Speaker n]` labels used in
 * transcripts/exports, and stable timestamps.
 */
export function TranscriptionSection() {
	const preference = usePreferenceProvider()
	const { toggleDiarization, handleStableTimestampsToggle } = useAuxModelToggles()

	return (
		<div className="space-y-5">
			<SectionCard>
				<LanguageInput />
			</SectionCard>

			<div className="space-y-2">
				<span className="px-1 text-sm font-semibold text-foreground/95">{m.speakerTiming()}</span>
				<SectionCard>
					<div className="space-y-4">
						<ToggleRow label={m.enableDiarization()} info={m.infoDiarization()}>
							<Switch checked={preference.diarizeEnabled} onCheckedChange={toggleDiarization} />
						</ToggleRow>
						<div className="h-px bg-border/45" />
						<ToggleRow label={m.speakerLabels()} info={m.speakerLabelsInfo()}>
							<Switch checked={preference.speakerLabels} onCheckedChange={preference.setSpeakerLabels} />
						</ToggleRow>
						<div className="h-px bg-border/45" />
						<ToggleRow label={m.enableStableTimestamps()} info={m.stableTimestampsInfo()}>
							<Switch checked={preference.stableTimestampsEnabled} onCheckedChange={handleStableTimestampsToggle} />
						</ToggleRow>
						<p className="text-xs leading-relaxed text-muted-foreground">{m.speakerOptionsHint()}</p>
					</div>
				</SectionCard>
			</div>

			<FfmpegCard />
		</div>
	)
}

function ToggleRow({ label, info, children }: { label: string; info: string; children: ReactNode }) {
	return (
		<div className="flex items-start justify-between gap-4">
			<span className="flex items-center gap-1 text-sm font-medium">
				<InfoTooltip text={info} />
				{label}
			</span>
			{children}
		</div>
	)
}

/**
 * ffmpeg instalment state: the full installer bundles it, the slim one ships
 * without it (~83 MB) and fetches it on demand — either automatically on first
 * use or from here.
 */
function FfmpegCard() {
	const { withProgress } = useModelDownload()
	const [status, setStatus] = useState<FfmpegStatus | null>(null)
	const [installing, setInstalling] = useState(false)

	const refresh = useCallback(async () => {
		setStatus(await getFfmpegStatus())
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	async function download() {
		setInstalling(true)
		try {
			await withProgress(m.downloadingFfmpeg() as string, () => installFfmpeg())
			await refresh()
			toast.success(m.downloadComplete())
		} catch (error) {
			console.error('ffmpeg download failed:', error)
			toast.error(String(error))
		} finally {
			setInstalling(false)
		}
	}

	const found = status?.found === true
	const sourceLabel = status?.source === 'bundled' ? m.ffmpegBundled() : status?.source === 'system' ? m.ffmpegSystem() : m.ffmpegDownloaded()

	return (
		<div className="space-y-2">
			<span className="px-1 text-sm font-semibold text-foreground/95">{m.runtimeDependencies()}</span>
			<SectionCard>
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<span className={cn('flex items-center gap-1.5 text-sm font-medium', found ? 'text-foreground' : 'text-amber-500')}>
							{found ? <Check className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4" />}
							ffmpeg
						</span>
						<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{found ? sourceLabel : m.notInstalled()}</span>
						<div className="ms-auto flex items-center gap-2">
							<Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={refresh} disabled={installing}>
								<RefreshCw className="h-3.5 w-3.5" />
								{m.checkAgain()}
							</Button>
							{!found && (
								<Button size="sm" className="h-8 gap-1.5" onClick={download} disabled={installing}>
									<Download className="h-3.5 w-3.5" />
									{installing ? m.downloadingModel() : m.downloadFfmpeg({ size: status?.downloadSizeMb ?? 83 })}
								</Button>
							)}
						</div>
					</div>
					<p className="text-xs leading-relaxed text-muted-foreground">{m.runtimeDependenciesInfo()}</p>
					{found && status?.path && (
						<p className="truncate font-mono text-[11px] text-muted-foreground" title={status.path}>
							{status.path}
						</p>
					)}
				</div>
			</SectionCard>
		</div>
	)
}
