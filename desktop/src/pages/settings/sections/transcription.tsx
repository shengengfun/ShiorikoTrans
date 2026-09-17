import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { useAuxModelToggles } from '~/lib/aux-model-toggles'
import { getFfmpegStatus, installFfmpeg, type FfmpegStatus } from '~/lib/ffmpeg'
import { useModelDownload } from '~/lib/model-download'
import { cn } from '~/lib/style'
import { usePreferenceProvider } from '~/providers/preference'
import { AdaptiveSections, SettingBlock, SettingRow, SettingsGroup, StateBadge } from '../components/kit'
import { ModelsSection } from './models'
import type { SettingsViewModel } from './shared'

/**
 * Transcription pipeline settings.
 *
 * The model tabs live here as well: models belong to the pipeline, so they are
 * sub-tabs of this section instead of a separate navigation entry.
 */
export function TranscriptionSection({ vm, tab }: { vm: SettingsViewModel; tab: string }) {
	if (tab === 'catalog' || tab === 'installed' || tab === 'storage') return <ModelsSection vm={vm} tab={tab} />
	if (tab === 'speakers') return <SpeakersTab />
	if (tab === 'runtime') return <RuntimeTab />
	return <BasicTab />
}

function BasicTab() {
	return (
		<SettingsGroup title={m.language()}>
			<SettingBlock id="inputLanguage">
				<LanguageInput />
			</SettingBlock>
		</SettingsGroup>
	)
}

function SpeakersTab() {
	const preference = usePreferenceProvider()
	const { toggleDiarization, handleStableTimestampsToggle } = useAuxModelToggles()

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.speakerTiming()}>
				<SettingRow
					id="diarization"
					control={<Switch checked={preference.diarizeEnabled} onCheckedChange={toggleDiarization} />}
				/>
				<SettingRow id="speakerLabels" control={<Switch checked={preference.speakerLabels} onCheckedChange={preference.setSpeakerLabels} />} />
				<SettingRow
					id="stableTimestamps"
					control={<Switch checked={preference.stableTimestampsEnabled} onCheckedChange={handleStableTimestampsToggle} />}
				/>
			</SettingsGroup>

			<p className="px-1 text-xs leading-relaxed text-muted-foreground">{m.stableTimestampsSlowNote()}</p>
		</div>
	)
}

function RuntimeTab() {
	const preference = usePreferenceProvider()
	const options = preference.advancedTranscribeOptions

	return (
		<AdaptiveSections>
			<FfmpegPanel />

			<SettingsGroup title={m.batchDefaults()} >
				<SettingRow
					id="includeSubFolders"
					control={
						<Switch
							checked={options.includeSubFolders}
							onCheckedChange={(checked) => preference.setAdvancedTranscribeOptions({ ...options, includeSubFolders: checked })}
						/>
					}
				/>
				<SettingRow
					id="skipIfExists"
					control={
						<Switch
							checked={options.skipIfExists}
							onCheckedChange={(checked) => preference.setAdvancedTranscribeOptions({ ...options, skipIfExists: checked })}
						/>
					}
				/>
				<SettingRow
					id="saveNextToAudioFile"
					control={
						<Switch
							checked={options.saveNextToAudioFile}
							onCheckedChange={(checked) => preference.setAdvancedTranscribeOptions({ ...options, saveNextToAudioFile: checked })}
						/>
					}
				/>
			</SettingsGroup>
		</AdaptiveSections>
	)
}

/**
 * ffmpeg instalment state: the full installer bundles it, the slim one ships
 * without it (~83 MB) and fetches it on demand — either automatically on first
 * use or from here.
 */
function FfmpegPanel() {
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
		<SettingsGroup title={m.runtimeDependencies()}>
			<SettingRow
				id="ffmpeg"
				hideDescription
				vertical
				control={
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							{found ? <Check className="h-4 w-4 shrink-0 text-primary" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
							<span className={cn('font-mono text-sm font-medium', !found && 'text-amber-600 dark:text-amber-400')}>ffmpeg</span>
							<StateBadge tone={found ? 'muted' : 'warning'}>{found ? sourceLabel : m.notInstalled()}</StateBadge>
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
						{found && status?.path && (
							<p className="truncate font-mono text-[11px] text-muted-foreground" title={status.path}>
								{status.path}
							</p>
						)}
					</div>
				}
			/>
		</SettingsGroup>
	)
}
