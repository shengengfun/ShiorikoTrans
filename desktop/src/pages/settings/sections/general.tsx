import { useEffect, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { AlertTriangle, Check, FileAudio, RotateCcw, Trash2, X } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'
import { ReactComponent as DiscordIcon } from '~/icons/discord.svg'
import { ReactComponent as GithubIcon } from '~/icons/github.svg'
import { ReactComponent as HeartIcon } from '~/icons/heart.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import * as config from '~/lib/config'
import { getLocalizedLanguageName, supportedLanguages } from '~/lib/i18n'
import { useRecentFiles } from '~/lib/use-recent-files'
import { usePreferenceProvider } from '~/providers/preference'
import { TextFormat } from '~/components/format-select'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { AdaptiveSections, EmptyHint, SettingPanel, SettingRow, SettingsGroup, StateBadge } from '../components/kit'
import type { SettingsViewModel } from './shared'

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

export function GeneralSection({ vm, tab, onTranscriptOpened }: { vm: SettingsViewModel; tab: string; onTranscriptOpened?: () => void }) {
	if (tab === 'recording') return <RecordingTab vm={vm} />
	if (tab === 'recent') return <RecentTab onTranscriptOpened={onTranscriptOpened} />
	if (tab === 'about') return <AboutTab vm={vm} />
	return <BasicTab vm={vm} />
}

function BasicTab({ vm }: { vm: SettingsViewModel }) {
	const preference = vm.preference

	return (
		<AdaptiveSections>
			<SettingsGroup title={m.groupInterface()}>
				<SettingRow
					id="displayLanguage"
					control={
						<Select
							value={supportedLanguages[preference.displayLanguage] ? preference.displayLanguage : 'en-US'}
							onValueChange={preference.setDisplayLanguage}>
							<SelectTrigger className="h-9 w-44 capitalize">
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
					}
				/>
				<SettingRow
					id="textDirection"
					control={
						<Select value={preference.textAreaDirection} onValueChange={(value) => preference.setTextAreaDirection(value as 'ltr' | 'rtl')}>
							<SelectTrigger className="h-9 w-44">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ltr">{m.directionLtr()}</SelectItem>
								<SelectItem value="rtl">{m.directionRtl()}</SelectItem>
							</SelectContent>
						</Select>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={m.exportFormat()}>
				<SettingRow
					id="subtitlePreset"
					control={
						<Button variant="outline" size="sm" className="h-8" onMouseDown={preference.enableSubtitlesPreset}>
							{m.presetForSubtitles()}
						</Button>
					}
				/>
				<SettingRow
					id="exportFormat"
					vertical
					control={
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">{m.transcriptFormat()}</Label>
								<Select value={preference.textFormatTranscript} onValueChange={(value) => preference.setTextFormatTranscript(value as TextFormat)}>
									<SelectTrigger className="h-9">
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
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">{m.summaryFormat()}</Label>
								<Select value={preference.textFormatSummary} onValueChange={(value) => preference.setTextFormatSummary(value as TextFormat)}>
									<SelectTrigger className="h-9">
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
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={m.whenFinished()}>
				<SettingRow id="soundOnFinish" control={<Switch checked={preference.soundOnFinish} onCheckedChange={preference.setSoundOnFinish} />} />
				<SettingRow
					id="soundOnTranslateFinish"
					control={<Switch checked={preference.soundOnTranslateFinish} onCheckedChange={preference.setSoundOnTranslateFinish} />}
				/>
				<SettingRow id="focusOnFinish" control={<Switch checked={preference.focusOnFinish} onCheckedChange={preference.setFocusOnFinish} />} />
			</SettingsGroup>

			<SettingsGroup title={m.ytdlpOptions()}>
				<SettingRow
					id="checkYtdlp"
					hideDescription
					info={m.ytdlpOptionsInfo()}
					control={<Switch checked={preference.shouldCheckYtDlpVersion} onCheckedChange={preference.setShouldCheckYtDlpVersion} />}
				/>
			</SettingsGroup>
		</AdaptiveSections>
	)
}

function RecordingTab({ vm }: { vm: SettingsViewModel }) {
	const preference = vm.preference
	const currentPath = preference.customRecordingPath ?? vm.defaultRecordingPath

	return (
		<SettingsGroup title={m.recording()}>
			<SettingRow
				id="storeRecordInDocuments"
				control={<Switch checked={preference.storeRecordInDocuments} onCheckedChange={preference.setStoreRecordInDocuments} />}
			/>
			<SettingRow
				id="recordingPath"
				vertical
				control={
					<div className="flex flex-wrap items-center gap-2">
						<span
							className="min-w-0 flex-1 truncate rounded-lg border border-border/50 bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
							title={currentPath}>
							{currentPath || '—'}
						</span>
						{preference.customRecordingPath && (
							<Button variant="ghost" size="sm" className="h-8" onMouseDown={vm.resetRecordingPath}>
								{m.resetToDefault()}
							</Button>
						)}
						<Button variant="outline" size="sm" className="h-8" onMouseDown={vm.changeRecordingPath}>
							{m.changeRecordingPath()}
						</Button>
					</div>
				}
			/>
		</SettingsGroup>
	)
}

function RecentTab({ onTranscriptOpened }: { onTranscriptOpened?: () => void }) {
	const { recent, missing, transcripts, remove, clear, prune, open, reveal } = useRecentFiles()
	const missingCount = [...missing].filter((path) => !transcripts[path]).length

	async function openRecent(file: (typeof recent)[number]) {
		if (await open(file)) onTranscriptOpened?.()
	}

	return (
		<AdaptiveSections>
			<SettingsGroup title={m.recentFiles()} description={m.recentFilesInfo()}>
				<SettingPanel id="recentFiles" className="space-y-1">
					{recent.length === 0 ? (
						<EmptyHint>{m.noRecentFiles()}</EmptyHint>
					) : (
						<ul className="space-y-1">
							{recent.slice(0, 8).map((file) => {
								const isMissing = missing.has(file.path)
								const transcript = transcripts[file.path]
								return (
									<li key={file.path} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40">
										<button type="button" onClick={() => void openRecent(file)} title={file.path} className="flex min-w-0 flex-1 items-center gap-2 text-left">
											{isMissing ? (
												<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
											) : (
												<FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
											)}
											<span className="min-w-0 flex-1">
												<span className="flex items-center gap-1.5">
													<span className="truncate text-sm font-medium">{file.name}</span>
													{transcript ? (
														<StateBadge tone="primary">{m.recentTranscriptSegments({ count: transcript.segments.toLocaleString() })}</StateBadge>
													) : (
														<StateBadge>{m.recentFileOnly()}</StateBadge>
													)}
													{isMissing && (
														<StateBadge tone="warning">{transcript ? m.recentSourceMissingBadge() : m.recentFileMissingBadge()}</StateBadge>
													)}
												</span>
												{transcript?.preview ? (
													<span className="mt-0.5 block truncate text-xs text-muted-foreground">“{transcript.preview}”</span>
												) : (
													<span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground/80">{file.path}</span>
												)}
											</span>
										</button>
										<span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{new Date(file.ts).toLocaleDateString()}</span>
										{!isMissing && (
											<Button
												variant="ghost"
												size="iconSm"
												className="h-7 w-7 shrink-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
												title={m.showInFolder()}
												onClick={() => void reveal(file)}>
												<LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
											</Button>
										)}
										<Button
											variant="ghost"
											size="iconSm"
											className="h-7 w-7 shrink-0 rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
											title={m.remove()}
											onClick={() => remove(file.path)}>
											<X className="h-3.5 w-3.5" />
										</Button>
									</li>
								)
							})}
						</ul>
					)}
					{missingCount > 0 && (
						<p className="px-2 pt-1 text-[11px] text-amber-600 dark:text-amber-400">{m.recentFilesMissingHint({ count: String(missingCount) })}</p>
					)}
					{(recent.length > 0 || missingCount > 0) && (
						<div className="flex flex-wrap items-center gap-2 px-2 pt-2">
							{missingCount > 0 && (
								<Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void prune()}>
									<Trash2 className="h-3.5 w-3.5" />
									{m.removeMissingRecents({ count: String(missingCount) })}
								</Button>
							)}
							<Button variant="ghost" size="sm" className="h-8" onClick={clear}>
								{m.clearRecentFiles()}
							</Button>
						</div>
					)}
				</SettingPanel>
			</SettingsGroup>

			<RecentLanguagesPanel />
		</AdaptiveSections>
	)
}

function RecentLanguagesPanel() {
	const { recentLanguages, setRecentLanguages } = usePreferenceProvider()
	const recent = [...(recentLanguages ?? [])].sort((a, b) => b.ts - a.ts)

	return (
		<SettingsGroup title={m.recentLanguages()} description={m.recentLanguagesInfo()}>
			<SettingPanel id="recentLanguages">
				{recent.length === 0 ? (
					<EmptyHint>{m.noRecentLanguages()}</EmptyHint>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{recent.map((item) => (
							<span key={item.code} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
								{item.code}
							</span>
						))}
					</div>
				)}
				<Button variant="ghost" size="sm" className="mt-2 h-8 px-2" disabled={recent.length === 0} onClick={() => setRecentLanguages([])}>
					{m.clear()}
				</Button>
			</SettingPanel>
		</SettingsGroup>
	)
}

function AboutTab({ vm }: { vm: SettingsViewModel }) {
	const preference = vm.preference
	const [confirmReset, setConfirmReset] = useState(false)

	useEffect(() => {
		if (!confirmReset) return
		const timer = window.setTimeout(() => setConfirmReset(false), 4000)
		return () => window.clearTimeout(timer)
	}, [confirmReset])

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.resetOptions()} description={m.resetOptionsInfo()}>
				<SettingRow
					id="resetOptions"
					hideDescription
					control={
						<Button
							variant={confirmReset ? 'destructive' : 'outline'}
							size="sm"
							className="h-8 gap-1.5"
							onMouseDown={() => {
								if (!confirmReset) {
									setConfirmReset(true)
									return
								}
								setConfirmReset(false)
								preference.resetOptions()
							}}>
							<RotateCcw className="h-3.5 w-3.5" />
							{confirmReset ? m.confirmResetAgain() : m.resetOptions()}
						</Button>
					}
				/>
			</SettingsGroup>

			<SettingsGroup title={m.general()}>
				<LinkRow label={m.projectLink()} icon={<LinkIcon className="h-4 w-4 text-muted-foreground" />} onClick={() => openUrl(config.aboutURL)} />
				<LinkRow label={m.reportIssue()} icon={<GithubIcon className="h-4 w-4 text-muted-foreground" />} onClick={vm.reportIssue} />
				<LinkRow
					label={m.supportTheProject()}
					icon={<HeartIcon className="h-4 w-4 fill-red-500 text-red-500 dark:fill-red-400 dark:text-red-400" />}
					onClick={() => openUrl(config.supportShiorikoTransURL)}
				/>
				<LinkRow label={m.discordCommunity()} icon={<DiscordIcon className="h-4 w-4 text-muted-foreground" />} onClick={() => openUrl(config.discordURL)} />
			</SettingsGroup>

			<p className="flex flex-wrap items-center gap-2 px-1 text-[11px] text-muted-foreground">
				<Check className="h-3.5 w-3.5 text-primary" />
				{m.appTitle()} {vm.appVersion}
			</p>
		</div>
	)
}

function LinkRow({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40">
			<span className="text-sm font-medium">{label}</span>
			{icon}
		</button>
	)
}
