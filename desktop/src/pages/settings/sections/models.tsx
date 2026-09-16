import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { ChevronRight, Download, FolderOpen, PencilLine, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { openModelSettings } from '~/lib/app'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Progress } from '~/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { getFriendlyModelName, isCatalogModelInstalled } from '~/lib/model'
import { useModelDownload } from '~/lib/model-download'
import { CATALOG_GROUPS, type CatalogGroup, type CatalogModel } from '~/lib/model-catalog'
import { detectModelType, MODEL_PIPELINES, type ModelType } from '~/lib/model-pipeline'
import { cn } from '~/lib/style'
import { ActionRow, AdaptiveSections, EmptyHint, SettingBlock, SettingPanel, SettingRow, SettingsGroup, StateBadge } from '../components/kit'
import type { SettingsViewModel } from './shared'

function getModelQuantization(filename: string): string | null {
	const match = filename.match(/(Q\d+_[A-Z0-9]+|F16|F32|Q4_0|Q5_0|Q8_0)/i)
	return match ? match[1].toUpperCase() : null
}

/** Engine badge colours — theme tokens so they stay readable in dark mode. */
const ENGINE_BADGES: Record<ModelType, string> = {
	whisper: 'bg-chart-1/15 text-chart-1',
	parakeet: 'bg-chart-2/15 text-chart-2',
	sensevoice: 'bg-chart-3/15 text-chart-3',
	hunyuan: 'bg-chart-4/15 text-chart-4',
	nemotron: 'bg-chart-5/15 text-chart-5',
	custom: 'bg-muted text-muted-foreground',
}

function engineBadge(engine: ModelType) {
	return `rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${ENGINE_BADGES[engine] ?? ENGINE_BADGES.custom}`
}

function formatSize(sizeMB: number) {
	return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`
}

/** Group hint messages (key -> i18n message). */
const GROUP_HINTS: Record<string, () => string> = {
	catalogHintNvidia: () => m.catalogHintNvidia(),
	catalogHintWhisper: () => m.catalogHintWhisper(),
	catalogHintSenseVoice: () => m.catalogHintSenseVoice(),
}

/** Every engine present in a group, e.g. `parakeet / nemotron`. */
function enginesOf(group: CatalogGroup) {
	return [...new Set(group.models.map((model) => model.engine))].join(' / ')
}

export function ModelsSection({ vm, tab }: { vm: SettingsViewModel; tab: string }) {
	if (tab === 'installed') return <InstalledTab vm={vm} />
	if (tab === 'storage') return <StorageTab vm={vm} />
	return <CatalogTab vm={vm} />
}

function CatalogTab({ vm }: { vm: SettingsViewModel }) {
	const [installingId, setInstallingId] = useState<string | null>(null)
	const [installProgress, setInstallProgress] = useState(0)
	const [installed, setInstalled] = useState<Record<string, boolean>>({})
	// Fold the catalog per engine family; the NVIDIA group (with the recommended
	// models) starts expanded so the usual choice is one click away.
	const [expanded, setExpanded] = useState<Record<string, boolean>>({ nvidia: true })
	const { downloadCatalogModel } = useModelDownload()

	// Live progress bar for catalog downloads (the Rust side emits `download_progress`).
	useEffect(() => {
		const unlisten = listen<[number, number]>('download_progress', (event) => {
			const [current, total] = event.payload
			if (total > 0) setInstallProgress(Math.min(100, Math.round((current / total) * 100)))
		})
		return () => {
			unlisten.then((fn) => fn())
		}
	}, [])

	async function refreshInstalled() {
		const entries = await Promise.all(
			CATALOG_GROUPS.flatMap((group) => group.models).map(async (entry) => [entry.id, await isCatalogModelInstalled(entry)] as const),
		)
		setInstalled(Object.fromEntries(entries))
	}

	useEffect(() => {
		refreshInstalled()
	}, [vm.models.length])

	async function install(entry: CatalogModel) {
		setInstallingId(entry.id)
		setInstallProgress(0)
		try {
			const path = await downloadCatalogModel(entry)
			if (path) {
				toast.success(m.downloadComplete())
				await refreshInstalled()
				await vm.loadModels()
				await vm.selectModel(path)
			}
		} catch (error) {
			console.error('catalog install failed:', error)
			toast.error(String(error))
		} finally {
			setInstallingId(null)
		}
	}

	return (
		<AdaptiveSections>
			<SettingsGroup title={m.modelCatalog()} description={m.modelCatalogInfo()}>
				<SettingPanel id="modelCatalog" className="space-y-2">
					{CATALOG_GROUPS.map((group) => {
						const open = expanded[group.id] ?? false
						const installedCount = group.models.filter((model) => installed[model.id]).length
						return (
							<div key={group.id} className="overflow-hidden rounded-xl border border-border/55">
								<button
									type="button"
									onClick={() => setExpanded((prev) => ({ ...prev, [group.id]: !open }))}
									className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40">
									<ChevronRight className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
									<span className="min-w-0 flex-1">
										<span className="flex flex-wrap items-center gap-2">
											<span className="truncate text-sm font-medium">{group.name}</span>
											<span className={engineBadge(group.engine)}>{enginesOf(group)}</span>
											<span className="text-[11px] text-muted-foreground">
												{installedCount > 0
													? `${installedCount}/${group.models.length} ${m.installed()}`
													: m.modelsCount({ count: String(group.models.length) })}
											</span>
										</span>
										<span className="mt-0.5 block text-[11px] text-muted-foreground">{(GROUP_HINTS[group.hintKey] ?? (() => ''))()}</span>
									</span>
								</button>
								{open && (
									<div className="divide-y divide-border/45 border-t border-border/45">
										{group.models.map((entry) => {
											const isInstalled = installed[entry.id] === true
											const busy = installingId === entry.id
											return (
												<div key={entry.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-1.5 ps-6">
															<span className="truncate text-sm font-medium">{entry.name}</span>
															{entry.quantization && <StateBadge>{entry.quantization}</StateBadge>}
															{entry.recommended && <StateBadge tone="primary">{m.recommended()}</StateBadge>}
														</div>
														<div className="mt-1 flex flex-wrap items-center gap-2 ps-6 text-[11px] text-muted-foreground">
															<span>
																{entry.languageCount != null
																	? m.languagesCount({ count: String(entry.languageCount) })
																	: (entry.languageCodes ?? []).join(' · ')}
															</span>
															<span>{formatSize(entry.sizeMB)}</span>
															{entry.requiresVad && <span>{m.needsVadModel()}</span>}
														</div>
														{busy && <Progress className="mt-2 h-1.5 ps-6" value={installProgress} />}
													</div>
													<Button
														size="sm"
														variant={isInstalled ? 'ghost' : 'default'}
														className="h-8"
														disabled={busy || installingId !== null}
														onClick={() => install(entry)}>
														{busy ? m.downloadingModel() : isInstalled ? m.installed() : m.download()}
													</Button>
												</div>
											)
										})}
									</div>
								)}
							</div>
						)
					})}
				</SettingPanel>
			</SettingsGroup>

			<SettingsGroup title={m.downloadModel()}>
				<SettingRow
					id="downloadModel"
					vertical
					control={
						<div className="flex items-center gap-2">
							<Input
								type="text"
								value={vm.downloadURL}
								onChange={(event) => vm.setDownloadURL(event.target.value)}
								placeholder={m.pasteModelLink()}
								className="h-9"
								onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
							/>
							<Button variant="default" size="sm" className="h-9 shrink-0 gap-1.5" onClick={vm.downloadModel}>
								<Download className="h-3.5 w-3.5" />
								{m.downloadModel()}
							</Button>
						</div>
					}
				/>
			</SettingsGroup>
		</AdaptiveSections>
	)
}

function InstalledTab({ vm }: { vm: SettingsViewModel }) {
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editingName, setEditingName] = useState('')
	const currentModel = vm.models.find((model) => model.path === vm.preference.modelPath)

	function commitRename() {
		if (!currentModel) return
		const name = editingName.trim()
		if (name) vm.preference.setModelDisplayNames({ ...vm.preference.modelDisplayNames, [currentModel.path]: name })
		setEditingPath(null)
	}

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.selectModel()} description={m.selectedModelInfo()}>
				<SettingRow
					id="selectedModel"
					vertical
					control={
						<div className="space-y-2">
							<Select
								value={vm.selectedGroupPath ?? undefined}
								onValueChange={vm.selectModelGroup}
								onOpenChange={(open) => {
									if (open) vm.loadModels()
								}}>
								<SelectTrigger className="h-9">
									<SelectValue placeholder={m.selectModel()} />
								</SelectTrigger>
								<SelectContent>
									{vm.modelGroups.map((group, index) => {
										const modelType = detectModelType(group.name)
										const pipeline = MODEL_PIPELINES[modelType]
										const fileCount = group.files.length
										return (
											<SelectItem key={index} value={group.path}>
												<span className="flex items-center gap-2">
													{group.name}
													{fileCount > 1 && <StateBadge>{`${fileCount} ${m.files()}`}</StateBadge>}
													<span className={engineBadge(modelType)}>{pipeline.engine}</span>
												</span>
											</SelectItem>
										)
									})}
								</SelectContent>
							</Select>

							{vm.modelFiles.length > 1 && (
								<Select value={vm.preference.modelPath ?? undefined} onValueChange={vm.selectModel}>
									<SelectTrigger className="h-9">
										<SelectValue placeholder={m.selectModel()} />
									</SelectTrigger>
									<SelectContent>
										{vm.modelFiles.map((file, index) => {
											const quant = getModelQuantization(file.name)
											const display = vm.preference.modelDisplayNames[file.path] ?? getFriendlyModelName(file.name)
											return (
												<SelectItem key={index} value={file.path}>
													<span className="flex items-center gap-2">
														{display}
														{quant && <StateBadge>{quant}</StateBadge>}
													</span>
												</SelectItem>
											)
										})}
									</SelectContent>
								</Select>
							)}

							{vm.models.length === 0 && <EmptyHint>{m.noModelsInstalled()}</EmptyHint>}

							{currentModel &&
								(editingPath === currentModel.path ? (
									<div className="flex items-center gap-2">
										<Input
											autoFocus
											value={editingName}
											className="h-9"
											onChange={(event) => setEditingName(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === 'Enter') commitRename()
												if (event.key === 'Escape') setEditingPath(null)
											}}
										/>
										<Button size="sm" className="h-9" onClick={commitRename}>
											{m.save()}
										</Button>
										<Button variant="ghost" size="sm" className="h-9" onClick={() => setEditingPath(null)}>
											{m.cancel()}
										</Button>
									</div>
								) : (
									<div className="flex flex-wrap items-center gap-1">
										<Button
											variant="ghost"
											size="sm"
											className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
											onClick={() => vm.openSelectedModel(currentModel.path)}>
											<FolderOpen className="size-3.5" /> {m.showInFolder()}
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
											onClick={() => {
												setEditingPath(currentModel.path)
												setEditingName(vm.preference.modelDisplayNames[currentModel.path] ?? getFriendlyModelName(currentModel.name))
											}}>
											<PencilLine className="size-3.5" /> {m.rename()}
										</Button>
										{vm.deleteModel && (
											<Button
												variant="ghost"
												size="sm"
												className="h-8 gap-1.5 px-2 text-destructive hover:text-destructive"
												onClick={() => vm.deleteModel(currentModel.path)}>
												<Trash2 className="size-3.5" /> {m.remove()}
											</Button>
										)}
									</div>
								))}
						</div>
					}
				/>
				<SettingRow
					id="modelSettings"
					control={
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5"
							disabled={!vm.preference.modelPath}
							onMouseDown={() => openModelSettings(vm.preference.modelPath)}>
							{m.modelSettings()}
							<Settings2 className="size-3.5" />
						</Button>
					}
				/>
			</SettingsGroup>
		</div>
	)
}

function StorageTab({ vm }: { vm: SettingsViewModel }) {
	return (
		<SettingsGroup title={m.modelsFolder()} description={m.modelsFolderInfo()}>
			<SettingBlock id="modelsFolder" className="p-0">
				<ActionRow label={m.modelsFolder()} onClick={vm.openModelPath} icon={<FolderIcon className="h-4 w-4 text-muted-foreground" />} />
			</SettingBlock>
			<SettingBlock id="changeModelsFolder" className="p-0">
				<ActionRow label={m.changeModelsFolder()} onClick={vm.changeModelsFolder} icon={<WrenchIcon className="h-4 w-4 text-muted-foreground" />} />
			</SettingBlock>
			<SettingBlock id="downloadModelsLink" className="p-0">
				<ActionRow label={m.downloadModelsLink()} onClick={vm.openModelsUrl} icon={<LinkIcon className="h-4 w-4 text-muted-foreground" />} />
			</SettingBlock>
		</SettingsGroup>
	)
}
