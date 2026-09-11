import { m } from '~/paraglide/messages.js'
import { MODEL_CATALOG } from '~/lib/model-catalog'
import { viewModel } from './view-model'
import { Progress } from '~/components/ui/progress'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent } from '~/components/ui/dialog'

function formatSize(sizeMB: number) {
	return sizeMB >= 1024 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB} MB`
}

function App() {
	const vm = viewModel()
	const isDownloading = vm.downloadProgress > 0 && vm.downloadProgress < 100

	return (
		<div className="app-shell flex min-h-screen items-center justify-center">
			<div className="app-panel w-full max-w-xl text-center">
				<p className="app-kicker mb-2">{m.setup({ defaultValue: 'Setup' })}</p>
				<div className="text-balance text-2xl font-semibold md:text-3xl">
					{isDownloading ? m.downloadingModel() : 'Welcome to ShiorikoTrans'}
				</div>
				<p className="mt-3 text-muted-foreground">
					{isDownloading
						? 'Downloading the transcription model...'
						: 'Choose how to get started with your first model.'}
				</p>

				<div className="mt-6 flex flex-col items-center gap-3">
					{isDownloading && (
						<Progress className="w-full max-w-sm" value={vm.downloadProgress} />
					)}
				</div>

				<div className="mt-8 flex flex-col gap-3">
					{MODEL_CATALOG.filter((entry) => entry.recommended).map((entry) => (
						<Button
							key={entry.id}
							className="mx-auto w-full max-w-sm justify-between"
							onClick={() => vm.installFromCatalog(entry)}
							disabled={isDownloading}>
							<span className="truncate">
								{entry.name}
								{entry.quantization ? ` · ${entry.quantization}` : ''}
							</span>
							<span className="shrink-0 text-xs opacity-80">{formatSize(entry.sizeMB)}</span>
						</Button>
					))}
					<Button
						variant="secondary"
						className="w-full max-w-sm mx-auto"
						onClick={vm.cancelSetup}
						disabled={isDownloading}
					>
						{m.iPreferManualSetup()}
					</Button>
				</div>
			</div>

			<Dialog open={vm.isOnline === false}>
				<DialogContent>
					<div className="text-center text-2xl font-semibold">{m.noConnection()}</div>
					<p className="mt-3 text-center text-muted-foreground">{m.infoManualDownload()}</p>
					<div className="mt-5 flex flex-col justify-center gap-2">
						<Button className="flex-1" onClick={vm.downloadIfOnline}>
							{m.tryAgain()}
						</Button>
						<Button variant="secondary" size="sm" onClick={vm.cancelSetup}>
							{m.iPreferManualSetup()}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

export default App
