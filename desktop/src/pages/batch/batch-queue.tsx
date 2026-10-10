import { NamedPath } from '~/lib/types'
import { openPath } from '~/lib/app'
import { ReactComponent as CheckIcon } from '~/icons/check.svg'
import { Progress } from '~/components/ui/progress'
import type { BatchFileState } from './view-model'
import { m } from '~/paraglide/messages.js'
import { cn } from '~/lib/style'

interface BatchQueueProps {
	files: NamedPath[]
	states: Record<number, BatchFileState>
}

export default function BatchQueue({ files, states }: BatchQueueProps) {
	return (
		<div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/55 p-3">
			{files.map((file, index) => {
				const state = states[index]
				const failed = state?.status === 'failed'
				const done = state?.status === 'done' || state?.status === 'skipped'
				return (
					<div key={file.path} className="flex flex-col gap-2 rounded-lg px-1 py-1">
						<div className="flex items-center justify-center gap-3">
							<div className="flex w-full min-w-0 flex-col justify-between gap-2">
								<div className="flex cursor-pointer justify-between gap-1 text-sm hover:text-primary/80" onClick={() => openPath(file)}>
									<span className={cn('min-w-0 flex-1 truncate', failed && 'text-destructive')}>{file.name}</span>
									{done && <CheckIcon className="h-5 w-5 stroke-success" />}
									{failed && <span className="text-xs text-destructive">{m.error()}</span>}
									{state?.status === 'running' && <span className="text-xs tabular-nums text-muted-foreground">{state.progress}%</span>}
								</div>
								{state?.status === 'running' ? <Progress value={state.progress} /> : null}
							</div>
						</div>
					</div>
				)
			})}
		</div>
	)
}
