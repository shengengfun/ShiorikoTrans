import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { platform, arch } from '@tauri-apps/plugin-os'
import { Check, ClipboardCopy, ExternalLink, FolderOpen, RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import * as config from '~/lib/config'
import { getFfmpegStatus } from '~/lib/ffmpeg'
import { getAppInfo } from '~/lib/logs'
import { modelNameFromPath } from '~/lib/model-list'
import { ActionRow, SettingPanel, SettingsGroup, StateBadge } from '../components/kit'
import type { SettingsViewModel } from './shared'

interface RuntimeInfo {
	commit: string
	avx2: boolean
	os: string
	ffmpeg: string
}

/**
 * About page: what the app is, what it is running on, and the maintenance
 * actions that used to be scattered across General/Advanced.
 */
export function AboutSection({ vm }: { vm: SettingsViewModel }) {
	const [info, setInfo] = useState<RuntimeInfo | null>(null)
	const [confirmReset, setConfirmReset] = useState(false)
	const [copied, setCopied] = useState(false)

	useEffect(() => {
		let cancelled = false
		async function load() {
			const [commit, avx2, ffmpeg] = await Promise.all([
				invoke<string>('get_commit_hash').catch(() => ''),
				invoke<boolean>('is_avx2_enabled').catch(() => true),
				getFfmpegStatus().catch(() => null),
			])
			const source = ffmpeg?.source === 'bundled' ? m.ffmpegBundled() : ffmpeg?.source === 'system' ? m.ffmpegSystem() : m.ffmpegDownloaded()
			if (cancelled) return
			setInfo({
				commit: commit.slice(0, 8),
				avx2,
				os: `${platform()} ${arch()}`,
				ffmpeg: String(ffmpeg?.found ? source : m.notInstalled()),
			})
		}
		load()
		return () => {
			cancelled = true
		}
	}, [])

	useEffect(() => {
		if (!confirmReset) return
		const timer = window.setTimeout(() => setConfirmReset(false), 4000)
		return () => window.clearTimeout(timer)
	}, [confirmReset])

	const model = vm.preference.modelPath ? modelNameFromPath(vm.preference.modelPath) : m.noModelsInstalled()

	async function copyDiagnostics() {
		try {
			const report = await getAppInfo()
			await navigator.clipboard.writeText(report)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 1500)
			toast.success(m.copied())
		} catch (error) {
			console.error('failed to copy diagnostics:', error)
			toast.error(String(error))
		}
	}

	return (
		<div className="space-y-5">
			<SettingsGroup>
				<SettingPanel id="aboutApp" className="space-y-3">
					<div className="flex items-center gap-3">
						<img src="/shiorikotrans.svg" alt="" className="h-12 w-12 shrink-0 rounded-xl border border-border/60 bg-muted/40" />
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<span className="text-base font-semibold">{m.appTitle()}</span>
								<StateBadge tone="primary">{vm.appVersion}</StateBadge>
							</div>
							<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={info?.commit}>
								{info ? `${info.os} · ${info.commit || 'dev'}` : m.loading()}
							</p>
						</div>
					</div>
					<dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
						<InfoLine label={m.selectModel()} value={model} />
						<InfoLine label={m.engine()} value={vm.preference.modelPipeline.engine} />
						<InfoLine label="ffmpeg" value={info?.ffmpeg ?? m.loading()} />
						<InfoLine label="CPU" value={info ? (info.avx2 ? 'AVX2' : m.avx2NotSupported().split('\n')[0]) : m.loading()} />
					</dl>
				</SettingPanel>
			</SettingsGroup>

			<SettingsGroup title={m.maintenance()}>
				<ActionRow label={m.copyDiagnostics()} onClick={copyDiagnostics} icon={copied ? <Check className="h-4 w-4 text-primary" /> : <ClipboardCopy className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.copyLogs()} onClick={vm.copyLogs} icon={<ClipboardCopy className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.logsFolder()} onClick={vm.revealLogs} icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.tempFolder()} onClick={vm.revealTemp} icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.modelsFolder()} onClick={vm.openModelPath} icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow
					label={m.openReleases()}
					description={m.openReleasesInfo()}
					onClick={() => openUrl(config.latestReleaseURL)}
					icon={<ExternalLink className="h-4 w-4 text-muted-foreground" />}
				/>
			</SettingsGroup>

			<SettingsGroup title={m.projectLink()}>
				<ActionRow label={m.reportIssue()} onClick={vm.reportIssue} icon={<GithubIcon className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.supportTheProject()} onClick={() => openUrl(config.supportShiorikoTransURL)} icon={<HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />} />
				<ActionRow label={m.discordCommunity()} onClick={() => openUrl(config.discordURL)} icon={<DiscordIcon className="h-4 w-4 text-muted-foreground" />} />
			</SettingsGroup>

			<SettingsGroup title={m.resetOptions()}>
				<ActionRow
					label={confirmReset ? m.confirmResetAgain() : m.resetOptions()}
					onClick={() => {
						if (!confirmReset) {
							setConfirmReset(true)
							return
						}
						setConfirmReset(false)
						vm.preference.resetOptions()
					}}
					icon={<RotateCcw className="h-4 w-4 text-muted-foreground" />}
				/>
				<ActionRow
					label={m.resetApp()}
					description={m.resetAppWarning()}
					onClick={vm.askAndReset}
					tone="destructive"
					icon={<RotateCcw className="h-4 w-4 text-destructive" />}
				/>
			</SettingsGroup>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
				<span className="flex items-center gap-1.5">
					<ShieldCheck className="h-3.5 w-3.5 text-primary" />
					MIT License
				</span>
				<span>whisper.cpp · sona</span>
				<span className="truncate">{m.credits()}</span>
			</div>
		</div>
	)
}

function InfoLine({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline gap-2">
			<dt className="shrink-0 text-muted-foreground">{label}</dt>
			<dd className="min-w-0 flex-1 truncate text-right font-mono" title={value}>
				{value}
			</dd>
		</div>
	)
}
