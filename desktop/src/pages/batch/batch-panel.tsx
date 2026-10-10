import { m } from '~/paraglide/messages.js'
import { ReactComponent as CancelIcon } from '~/icons/cancel.svg'
import { ReactComponent as PlayIcon } from '~/icons/play.svg'
import { NamedPath } from '~/lib/types'
import { Button } from '~/components/ui/button'

interface BatchPanelProps {
	files: NamedPath[]
	onStart: () => void
	onCancel: () => void
	completed: number
	concurrency: number
	inProgress: boolean
	isAborting: boolean
	modelPath: string | null
}

export default function BatchPanel({ files, onStart, onCancel, completed, concurrency, inProgress, isAborting, modelPath }: BatchPanelProps) {
	return (
		<div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-muted/55 p-3 md:p-4">
			<div className="flex flex-col">
				{inProgress && (
					<span className="text-sm font-medium tracking-wide">
						{m.transcribing()} ({completed}/{files.length})
						{concurrency > 1 ? ` · ${m.parallelFiles({ count: String(concurrency) })}` : ''}
					</span>
				)}
				{!isAborting && !inProgress && completed < files.length && (
					<span className="text-sm font-medium tracking-wide">
						{m.transcribe()} {files.length} {m.files()}
					</span>
				)}
				{!isAborting && !inProgress && completed >= files.length && files.length > 0 && (
					<span className="text-sm font-medium tracking-wide">
						{m.transcribed()} {files.length} {m.files()}
					</span>
				)}
				{isAborting && <span className="text-sm font-medium tracking-wide">{m.aborting()}...</span>}
			</div>
			<div className="ms-auto flex gap-2">
				<Button
					onClick={() => (inProgress ? onCancel() : onStart())}
					disabled={!inProgress && !modelPath}
					size="iconSm"
					className={inProgress ? 'rounded-full bg-destructive hover:bg-destructive/90' : 'rounded-full bg-success hover:bg-success/90'}>
					{inProgress ? (
						<CancelIcon className="h-5 w-5 stroke-destructive-foreground" />
					) : (
						<PlayIcon className="h-5 w-5 stroke-success-foreground stroke-2" />
					)}
				</Button>
			</div>
		</div>
	)
}
