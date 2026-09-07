import { useState } from 'react'
import { FolderOpen, PencilLine, Trash2 } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { ReactComponent as WrenchIcon } from '~/icons/wrench.svg'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { SectionCard, type SettingsViewModel } from './shared'
import { getFriendlyModelName } from '~/lib/model'
import { detectModelType, MODEL_PIPELINES } from '~/lib/model-pipeline'

function getModelQuantization(filename: string): string | null {
	const match = filename.match(/(Q\d+_[A-Z0-9]+|F16|F32|Q4_0|Q5_0|Q8_0)/i)
	return match ? match[1].toUpperCase() : null
}

export function ModelsSection({ vm }: { vm: SettingsViewModel }) {
	const [editingPath, setEditingPath] = useState<string | null>(null)
	const [editingName, setEditingName] = useState('')
	const currentModel = vm.models.find((model) => model.path === vm.preference.modelPath)

	return (
		<div className="space-y-5">
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
							<Button variant="default" size="icon" onClick={vm.downloadModel} className="shrink-0">
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
													<span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${modelType === 'whisper' ? 'bg-blue-100 text-blue-700' : modelType === 'nemotron' ? 'bg-purple-100 text-purple-700' : modelType === 'sensevoice' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
														{pipeline.engine}
													</span>
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
										<SelectValue placeholder="选择模型文件" />
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
											<Trash2 className="size-3.5" /> 删除
										</Button>
									)}
								</div>
							))}
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
