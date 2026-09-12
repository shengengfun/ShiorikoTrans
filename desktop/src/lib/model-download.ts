import { listen } from '@tauri-apps/api/event'
import { m } from '~/paraglide/messages.js'
import { installCatalogModel } from '~/lib/model'
import type { CatalogModel } from '~/lib/model-catalog'
import { useToastProvider } from '~/providers/toast'

/**
 * Model downloads through the shared progress toast (the same popup used when
 * the diarization model is fetched), so every engine/helper model download is
 * visible instead of only a spinner on the button.
 *
 * The Rust `download_model` command emits `download_progress` with
 * `[current, total]` bytes, which drives the percentage.
 */
export function useModelDownload() {
	const progressToast = useToastProvider()

	async function withProgress<T>(message: string, run: () => Promise<T>): Promise<T> {
		progressToast.setMessage(message)
		progressToast.setProgress(0)
		progressToast.setOpen(true)

		const unlisten = await listen<[number, number]>('download_progress', (event) => {
			const [current, total] = event.payload
			if (total > 0) progressToast.setProgress(Math.min(100, (current / total) * 100))
		})

		try {
			return await run()
		} finally {
			unlisten()
			progressToast.setOpen(false)
			progressToast.setProgress(null)
		}
	}

	/** Install a curated catalog entry, showing its name in the progress toast. */
	function downloadCatalogModel(entry: CatalogModel) {
		return withProgress(m.downloadingModelNamed({ name: entry.name }) as string, () => installCatalogModel(entry))
	}

	return { withProgress, downloadCatalogModel }
}
