import { useEffect, useState } from 'react'
import * as dialog from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { Download, FolderOpen } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { listLocalModels, type LocalModelFile } from '~/lib/local-engine'
import { useModelDownload } from '~/lib/model-download'
import { LOCAL_MODELS, installTranslateModel, isTranslateModelInstalled } from '~/lib/translate-models'
import { usePreferenceProvider } from '~/providers/preference'
import { Button } from '~/components/ui/button'
import { SettingPanel } from './kit'

function formatSize(sizeMB: number) {
	return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`
}

/**
 * Downloads / picks the GGUF files that the on-device engines use. The same
 * catalogue backs summarisation and translation, so this list is shared by both
 * settings pages.
 */
export function LocalModelList({
	id,
	selected,
	onSelect,
	onChange,
}: {
	id: 'translateModels' | 'summarizeLocalModels'
	selected?: string
	onSelect?: (filename: string) => void
	/** Notified after a download so the caller can refresh the engine status. */
	onChange?: () => void
}) {
	const { withProgress } = useModelDownload()
	const preference = usePreferenceProvider()
	const [installingId, setInstallingId] = useState<string | null>(null)
	const [installed, setInstalled] = useState<Record<string, boolean>>({})
	const [extras, setExtras] = useState<LocalModelFile[]>([])

	async function refreshInstalled() {
		const entries = await Promise.all(LOCAL_MODELS.map(async (entry) => [entry.id, await isTranslateModelInstalled(entry)] as const))
		setInstalled(Object.fromEntries(entries))
		// GGUF files that are not in the catalogue (dropped in by hand) are still
		// usable, so they are listed as well.
		const known = new Set(LOCAL_MODELS.map((entry) => entry.filename))
		setExtras((await listLocalModels()).filter((file) => !known.has(file.filename)))
	}

	useEffect(() => {
		refreshInstalled()
	}, [])

	async function download(entryId: string) {
		const entry = LOCAL_MODELS.find((model) => model.id === entryId)
		if (!entry) return
		setInstallingId(entry.id)
		try {
			const path = await withProgress(m.downloadingModelNamed({ name: entry.name }) as string, () =>
				installTranslateModel(entry, preference.hfMirrorEnabled),
			)
			if (path) {
				// Point the engine at the freshly downloaded file straight away.
				onSelect?.(entry.filename)
				await refreshInstalled()
				onChange?.()
			}
		} catch (error) {
			console.error('local model download failed:', error)
			toast.error(String(error))
		} finally {
			setInstallingId(null)
		}
	}

	async function pickFile() {
		try {
			const picked = await dialog.open({ multiple: false, filters: [{ name: 'GGUF', extensions: ['gguf'] }] })
			if (typeof picked === 'string') {
				onSelect?.(picked)
				onChange?.()
			}
		} catch (error) {
			console.error('failed to pick a model file:', error)
		}
	}

	return (
		<SettingPanel id={id} className="space-y-2">
			<ul className="space-y-2">
				{LOCAL_MODELS.map((entry) => {
					const isInstalled = installed[entry.id] === true
					const busy = installingId === entry.id
					const isSelected = selected === entry.filename
					return (
						<li key={entry.id} className="rounded-xl border border-border/55 px-3 py-2.5">
							<div className="flex flex-wrap items-center gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="truncate text-sm font-medium">{entry.name}</span>
										<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{entry.quantization}</span>
										{entry.specialised && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{m.translationSpecialised()}</span>}
										{isSelected && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{m.selected()}</span>}
									</div>
									<div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
										<span>{entry.languages}</span>
										<span>{formatSize(entry.sizeMB)}</span>
									</div>
								</div>
								{isInstalled && !isSelected && onSelect && (
									<Button size="sm" variant="outline" className="h-8" onClick={() => onSelect(entry.filename)}>
										{m.useModel()}
									</Button>
								)}
								<Button
									size="sm"
									className="h-8 gap-1.5"
									variant={isInstalled ? 'ghost' : 'default'}
									disabled={busy || installingId !== null}
									onClick={() => download(entry.id)}>
									{!isInstalled && !busy && <Download className="h-3.5 w-3.5" />}
									{busy ? m.downloadingModel() : isInstalled ? m.installed() : m.download()}
								</Button>
							</div>
						</li>
					)
				})}
			</ul>
			{extras.length > 0 && (
				<ul className="space-y-2">
					{extras.map((file) => (
						<li key={file.filename} className="rounded-xl border border-border/55 px-3 py-2.5">
							<div className="flex flex-wrap items-center gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-1.5">
										<span className="truncate text-sm font-medium">{file.filename}</span>
										{selected === file.filename && (
											<span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{m.selected()}</span>
										)}
									</div>
									<div className="mt-0.5 text-[11px] text-muted-foreground">{formatSize(file.sizeMB)}</div>
								</div>
								{selected !== file.filename && onSelect && (
									<Button size="sm" variant="outline" className="h-8" onClick={() => onSelect(file.path)}>
										{m.useModel()}
									</Button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
			<Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={pickFile}>
				<FolderOpen className="h-3.5 w-3.5" />
				{m.pickModelFile()}
			</Button>
		</SettingPanel>
	)
}
