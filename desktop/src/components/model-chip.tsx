import { Bot, Settings2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { openModelSettings } from '~/lib/app'
import { modelDisplayName, modelNameFromPath, useTranscriptionModels } from '~/lib/model-list'
import { getModelPipelineFromPath } from '~/lib/model-pipeline'
import { usePreferenceProvider } from '~/providers/preference'

/**
 * Active-model indicator for the transcription pages: shows which model (and
 * engine) the next transcription will use and opens the model settings dialog
 * straight from the page, without a detour through Settings or the title bar.
 */
export default function ModelChip() {
	const preference = usePreferenceProvider()
	const navigate = useNavigate()
	const path = preference.modelPath
	const { models } = useTranscriptionModels(path)

	if (!path) {
		return (
			<Button variant="outline" size="sm" className="w-full justify-center gap-2 rounded-xl" onClick={() => navigate('/#settings')}>
				<Bot className="size-4" />
				{m.selectModel()}
			</Button>
		)
	}

	const entry = models.find((model) => model.path === path)
	const name = entry ? modelDisplayName(entry, preference.modelDisplayNames) : modelNameFromPath(path)
	const pipeline = getModelPipelineFromPath(path)

	return (
		<button
			type="button"
			onClick={() => openModelSettings(path)}
			title={`${name} · ${m.modelSettings()}`}
			className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-muted/40 py-1.5 pe-2 ps-3 text-left transition-colors hover:bg-accent/40">
			<Bot className="size-4 shrink-0 text-primary" />
			<span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
			<span className="shrink-0 rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
				{pipeline.engine}
			</span>
			<Settings2 className="size-3.5 shrink-0 text-muted-foreground" />
		</button>
	)
}
