import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { ChevronRight, FolderOpen, PencilLine, Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import { openModelSettings } from '~/lib/app'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Progress } from '~/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { SectionCard, type SettingsViewModel } from './shared'
import { getFriendlyModelName, isCatalogModelInstalled } from '~/lib/model'
import { useModelDownload } from '~/lib/model-download'
import { CATALOG_GROUPS, type CatalogGroup, type CatalogModel } from '~/lib/model-catalog'
import { detectModelType, MODEL_PIPELINES, type ModelType } from '~/lib/model-pipeline'
import { cn } from '~/lib/style'

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

export function ModelsSection({ vm }: { vm: SettingsViewModel }) {
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editingName, setEditingName] = useState('')
	const [installingId, setInstallingId] = useState<string | null>(null)
	const [installProgress, setInstallProgress] = useState(0)
	const [installed, setInstalled] = useState<Record<string, boolean>>({})
	// Fold the catalog per engine family; the NVIDIA group (with the recommended
	// models) starts expanded so the usual choice is one click away.
	const [expanded, setExpanded] = useState<Record<string, boolean>>({ nvidia: true })
	const currentModel = vm.models.find((model) => model.path === vm.preference.modelPath)
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
		<div className="space-y-5">
			<SectionCard>
				<div className="space-y-4">
					<div className="space-y-1">
						<Label>{m.modelCatalog()}</Label>
						<p className="text-xs text-muted-foreground">{m.modelCatalogInfo()}</p>
					</div>
					<div className="space-y-2">
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
											<span className="mt-0.5 block text-[11px] text-muted-foreground">
												{(GROUP_HINTS[group.hintKey] ?? (() => ''))()}
											</span>
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
																{entry.quantization && (
																	<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
																		{entry.quantization}
																	</span>
																)}
																{entry.recommended && (
																	<span className="rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium text-primary">{m.recommended()}</span>
																)}
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
					</div>
				</div>
			</SectionCard>

			<SectionCard>
				<div className="space-y-5">
					<div className="space-y-2">
						<Label>{m.downloadModel()}</Label>
						<div className="flex items-center gap-2">
							<Input
								type="text"
								value={vm.downloadURL}
								onChange={(event) => vm.setDownloadURL(event.target.value)}
								placeholder={m.pasteModelLink()}
								onKeyDown={(event) => (event.key === 'Enter' ? vm.downloadModel() : null)}
							/>
							<Button variant="default" size="icon" onClick={vm.downloadModel} className="shrink-0" aria-label={m.downloadModel()}>
								<svg
									aria-hidden="true"
									focusable="false"
									role="img"
									className="octicon octicon-download"
									viewBox="0 0 16 16"
									width="16"
									height="16"
									fill="currentColor">
									<path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z"></path>
									<path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.749.749 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06l1.97 1.969Z"></path>
								</svg>
							</Button>
						</div>
					</div>

					<div className="space-y-2">
						<Label>{m.selectModel()}</Label>
						<div className="space-y-2">
							<Select
								value={vm.selectedGroupPath ?? undefined}
								onValueChange={vm.selectModelGroup}
								onOpenChange={(open) => {
									if (open) vm.loadModels()
								}}>
								<SelectTrigger>
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
													{fileCount > 1 && (
														<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
															{fileCount} files
														</span>
													)}
													<span className={engineBadge(modelType)}>{pipeline.engine}</span>
												</span>
											</SelectItem>
										)
									})}
								</SelectContent>
							</Select>
							{vm.modelFiles.length > 1 && (
								<Select
									value={vm.preference.modelPath ?? undefined}
									onValueChange={vm.selectModel}>
									<SelectTrigger>
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
														{quant && (
															<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
																{quant}
															</span>
														)}
													</span>
												</SelectItem>
											)
										})}
									</SelectContent>
								</Select>
							)}
						</div>
							{currentModel && (editingPath === currentModel.path ? (
								<div className="flex items-center gap-2">
									<Input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => {
										if (event.key === 'Enter') {
											const name = editingName.trim()
											if (name) vm.preference.setModelDisplayNames({ ...vm.preference.modelDisplayNames, [currentModel.path]: name })
											setEditingPath(null)
										}
										if (event.key === 'Escape') setEditingPath(null)
									}} />
									<Button size="sm" onClick={() => {
										const name = editingName.trim()
										if (name) vm.preference.setModelDisplayNames({ ...vm.preference.modelDisplayNames, [currentModel.path]: name })
										setEditingPath(null)
									}}>{m.save()}</Button>
									<Button variant="ghost" size="sm" onClick={() => setEditingPath(null)}>{m.cancel()}</Button>
								</div>
							) : (
								<div className="mt-2 flex items-center justify-end gap-1 px-1">
									<Button variant="ghost" size="sm" className="h-7 px-2.5 text-muted-foreground hover:text-foreground" onClick={() => vm.openSelectedModel(currentModel.path)}>
										<FolderOpen className="size-3.5" /> {m.showInFolder()}
									</Button>
									<Button variant="ghost" size="sm" className="h-7 px-2.5 text-muted-foreground hover:text-foreground" onClick={() => { setEditingPath(currentModel.path); setEditingName(vm.preference.modelDisplayNames[currentModel.path] ?? getFriendlyModelName(currentModel.name)) }}>
										<PencilLine className="size-3.5" /> {m.rename()}
									</Button>
									{vm.deleteModel && (
										<Button variant="ghost" size="sm" className="h-7 px-2.5 text-destructive hover:text-destructive" onClick={() => vm.deleteModel(currentModel.path)}>
											<Trash2 className="size-3.5" /> {m.remove()}
										</Button>
									)}
								</div>
							))}
							<Button
								variant="outline"
								size="sm"
								className="mt-2 h-10 w-full justify-between px-3"
								disabled={!vm.preference.modelPath}
								onMouseDown={() => openModelSettings(vm.preference.modelPath)}>
								{m.modelSettings()}
								<Settings2 className="size-3.5" />
							</Button>
						</div>

						{!vm.isMacOS && (
						<div className="space-y-2">
							<Label>{m.gpuDevice()}</Label>
							{vm.gpuDevices.length > 0 ? (
								<Select
									value={vm.preference.gpuDevice != null ? String(vm.preference.gpuDevice) : 'auto'}
									onValueChange={(value) => {
										vm.preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))
									}}>
									<SelectTrigger>
										<SelectValue placeholder={m.gpuDevice()} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="auto">{m.auto()}</SelectItem>
										{vm.gpuDevices.map((device) => (
											<SelectItem key={device.index} value={String(device.index)}>
												{device.description}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<Input
									type="number"
									value={vm.preference.gpuDevice ?? ''}
									onChange={(e) => {
										const val = e.target.value
										vm.preference.setGpuDevice(val === '' ? null : parseInt(val, 10))
									}}
									placeholder={m.gpuDevicePlaceholder()}
								/>
							)}
						</div>
					)}

					<div className="space-y-1 pt-1">
							<Button
								variant="ghost"
								onMouseDown={vm.openModelsUrl}
								className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
								{m.downloadModelsLink()} <LinkIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								onMouseDown={vm.openModelPath}
								className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
								{m.modelsFolder()} <FolderIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
							<Button
								variant="ghost"
								onMouseDown={vm.changeModelsFolder}
								className="h-11 w-full justify-between rounded-lg px-3 font-medium hover:bg-accent/60">
								{m.changeModelsFolder()} <WrenchIcon className="h-4 w-4 text-muted-foreground" />
							</Button>
						</div>
					</div>
				</SectionCard>
			</div>
	)
}
