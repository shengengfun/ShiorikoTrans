import { openUrl } from '@tauri-apps/plugin-opener'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { getLocalizedLanguageName, supportedLanguages } from '~/lib/i18n'
import { TextFormat } from '~/components/format-select'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { SectionCard, type SettingsViewModel } from './shared'

const EXPORT_FORMATS: { value: TextFormat; label: string }[] = [
	{ value: 'normal', label: '.txt' },
	{ value: 'srt', label: 'SRT' },
	{ value: 'vtt', label: 'VTT' },
	{ value: 'json', label: 'JSON' },
	{ value: 'csv', label: 'CSV' },
	{ value: 'docx', label: 'DOCX' },
	{ value: 'md', label: 'Markdown' },
	{ value: 'pdf', label: 'PDF' },
	{ value: 'html', label: 'HTML' },
]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 py-2">
			<span className="text-sm font-medium">{label}</span>
			{children}
		</div>
	)
}

export function GeneralSection({ vm }: { vm: SettingsViewModel }) {
	const preference = vm.preference
	const recentFiles = [...(preference.recentFiles ?? [])].sort((a, b) => b.ts - a.ts)
	const recentLanguages = [...(preference.recentLanguages ?? [])].sort((a, b) => b.ts - a.ts)

	return (
		<div className="space-y-5">
			{/* Interface language */}
			<SectionCard>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label>{m.language()}</Label>
						<Select
							value={supportedLanguages[preference.displayLanguage] ? preference.displayLanguage : 'en-US'}
							onValueChange={preference.setDisplayLanguage}>
							<SelectTrigger className="capitalize">
								<SelectValue placeholder={m.selectLanguage()} />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(supportedLanguages).map(([code, name]) => (
									<SelectItem key={code} value={code} className="capitalize">
										{code === getLocale() ? getLocalizedLanguageName(name) : name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</SectionCard>

			{/* Behaviour when a transcription finishes */}
			<div className="space-y-2">
				<span className="px-1 text-sm font-semibold text-foreground/95">{m.whenFinished()}</span>
				<SectionCard>
					<Row label={m.playSoundOnFinish()}>
						<Switch checked={preference.soundOnFinish} onCheckedChange={preference.setSoundOnFinish} />
					</Row>
					<div className="h-px bg-border/45" />
					<Row label={m.focusWindowOnFinish()}>
						<Switch checked={preference.focusOnFinish} onCheckedChange={preference.setFocusOnFinish} />
					</Row>
				</SectionCard>
			</div>

			{/* Recording */}
			<div className="space-y-2">
				<span className="px-1 text-sm font-semibold text-foreground/95">{m.recording()}</span>
				<SectionCard>
					<Row label={m.saveRecordInDocumentsFolder()}>
						<Switch checked={preference.storeRecordInDocuments} onCheckedChange={preference.setStoreRecordInDocuments} />
					</Row>
					<div className="h-px bg-border/45" />
					<div className="space-y-2 pt-3">
						<Label>{m.recordingSavePath()}</Label>
						<div className="flex items-center justify-between gap-2">
							<p className="min-w-0 truncate text-sm text-muted-foreground" title={preference.customRecordingPath ?? vm.defaultRecordingPath}>
								{preference.customRecordingPath ?? vm.defaultRecordingPath}
							</p>
							<div className="flex shrink-0 items-center gap-2">
								{preference.customRecordingPath && (
									<Button variant="ghost" size="sm" onMouseDown={vm.resetRecordingPath}>
										{m.resetToDefault()}
									</Button>
								)}
								<Button variant="outline" size="sm" onMouseDown={vm.changeRecordingPath}>
									{m.changeRecordingPath()}
								</Button>
							</div>
						</div>
					</div>
				</SectionCard>
			</div>

			{/* Default export formats */}
			<div className="space-y-2">
				<span className="px-1 text-sm font-semibold text-foreground/95">{m.exportFormat()}</span>
				<SectionCard>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>{m.transcriptFormat()}</Label>
							<Select value={preference.textFormatTranscript} onValueChange={(value) => preference.setTextFormatTranscript(value as TextFormat)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{EXPORT_FORMATS.map((format) => (
										<SelectItem key={format.value} value={format.value}>
											{format.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>{m.summaryFormat()}</Label>
							<Select value={preference.textFormatSummary} onValueChange={(value) => preference.setTextFormatSummary(value as TextFormat)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{EXPORT_FORMATS.map((format) => (
										<SelectItem key={format.value} value={format.value}>
											{format.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</SectionCard>
			</div>

			{/* Recently used files / languages */}
			<SectionCard>
				<div className="space-y-4">
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-2">
							<span className="text-sm font-medium">{m.recentFiles()}</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-muted-foreground hover:text-foreground"
								disabled={recentFiles.length === 0}
								onMouseDown={() => preference.setRecentFiles([])}>
								{m.clear()}
							</Button>
						</div>
						{recentFiles.length === 0 ? (
							<p className="text-xs italic text-muted-foreground">{m.noRecentFiles()}</p>
						) : (
							<ul className="space-y-0.5">
								{recentFiles.slice(0, 6).map((file) => (
									<li key={file.path} className="flex items-center justify-between gap-3 rounded-md px-1 py-1 text-sm">
										<span className="min-w-0 flex-1 truncate" title={file.path}>
											{file.name}
										</span>
										<span className="shrink-0 font-mono text-[11px] text-muted-foreground">{new Date(file.ts).toLocaleDateString()}</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className="h-px bg-border/45" />
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-2">
							<span className="text-sm font-medium">{m.recentLanguages()}</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-muted-foreground hover:text-foreground"
								disabled={recentLanguages.length === 0}
								onMouseDown={() => preference.setRecentLanguages([])}>
								{m.clear()}
							</Button>
						</div>
						{recentLanguages.length === 0 ? (
							<p className="text-xs italic text-muted-foreground">{m.noRecentLanguages()}</p>
						) : (
							<div className="flex flex-wrap gap-1.5">
								{recentLanguages.map((item) => (
									<span key={item.code} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
										{item.code}
									</span>
								))}
							</div>
						)}
					</div>
				</div>
			</SectionCard>

			{/* Restore defaults */}
			<Button variant="outline" onMouseDown={preference.resetOptions} className="h-11 w-full justify-between rounded-xl border-border/55 px-4 font-medium">
				{m.resetOptions()}
			</Button>

			<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
				<Button variant="ghost" onMouseDown={() => openUrl(config.aboutURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.projectLink()} <LinkIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
				<Button variant="ghost" onMouseDown={vm.reportIssue} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.reportIssue()} <GithubIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
				<Button variant="ghost" onMouseDown={() => openUrl(config.supportShiorikoTransURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.supportTheProject()} <HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />
				</Button>
				<Button variant="ghost" onMouseDown={() => openUrl(config.discordURL)} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">
					{m.discordCommunity()} <DiscordIcon className="h-4 w-4 text-muted-foreground" />
				</Button>
			</div>
		</div>
	)
}
