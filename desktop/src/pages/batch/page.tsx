import { m } from '~/paraglide/messages.js'
import LanguageInput from '~/components/language-input'
import Layout from '~/components/layout'
import BatchPanel from './batch-panel'
import BatchQueue from './batch-queue'
import { viewModel } from './view-model'
import { Button } from '~/components/ui/button'
import FormatMultiSelect from '~/components/format-multi-select'

export default function BatchPage() {
	const vm = viewModel()

	return (
		<Layout>
			<div className="mx-auto flex w-full min-w-0 flex-col gap-6">
				<div className="grid w-full min-w-0 items-start gap-6 md:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
					<div className="min-w-0">
						<div className="app-panel space-y-4">
							<div className="space-y-1">
								<p className="app-kicker">{m.batch()}</p>
								<h2 className="text-2xl font-semibold">{m.transcribe()} {m.files()}</h2>
							</div>
							<LanguageInput />
							<FormatMultiSelect setFormats={vm.setFormats} formats={vm.formats} />

							<div className="pt-2">
								<BatchPanel
									index={vm.currentIndex}
									inProgress={vm.inProgress}
									onCancel={vm.cancel}
									isAborting={vm.isAborting}
									onStart={vm.start}
									files={vm.files}
									modelPath={vm.preference.modelPath}
								/>
								{!vm.preference.modelPath && (
									<p className="mt-2 text-center text-sm text-muted-foreground">{m.noModelSelected()}</p>
								)}
								{!vm.inProgress && !vm.isAborting && (
									<Button variant="link" onMouseDown={vm.selectFiles} className="mt-2 px-0 text-xs">
										{m.changeFiles()}
									</Button>
								)}
							</div>
						</div>
					</div>
					<div className="flex min-w-0 flex-col gap-5 md:sticky md:top-6 md:max-h-[calc(100dvh-9rem)] md:self-start md:overflow-y-auto">
						<div className="app-panel space-y-3">
							<div className="flex items-center justify-between gap-2">
								<p className="app-kicker">{m.files()}</p>
								<span className="text-sm text-muted-foreground">{vm.files.length}</span>
							</div>
							{vm.files.length ? (
								<BatchQueue files={vm.files} progress={vm.progress} activeIndex={vm.currentIndex} />
							) : (
								<div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-background/50 p-6 text-center">
									<p className="text-sm text-muted-foreground">{m.changeFiles()}</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</Layout>
	)
}
