import { listen } from '@tauri-apps/api/event'
import { m } from '~/paraglide/messages.js'
import { installCatalogModel } from '~/lib/model'
import type { CatalogModel } from '~/lib/model-catalog'
import { usePreferenceProvider } from '~/providers/preference'
import { useToastProvider } from '~/providers/toast'

/** `12.3 MB/s`, or an empty string while the speed is still unknown. */
function formatSpeed(bytesPerSecond: number): string {
	if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
	return bytesPerSecond >= 1024 * 1024
		? `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
		: `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`
}

function formatEta(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return ''
	const minutes = Math.floor(seconds / 60)
	if (minutes < 1) return `${Math.round(seconds)}s`
	if (minutes < 60) return `${minutes}m`
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/**
 * Model downloads through the shared progress toast (the same popup used when
 * the diarization model is fetched), so every engine/helper model download is
 * visible instead of only a spinner on the button.
 *
 * The Rust `download_model` command emits `download_progress` with
 * `[current, total]` bytes, which drives the percentage; the throughput and ETA
 * are derived here from the deltas, because a multi-GB download over a slow link
 * otherwise looks stuck.
 */
export function useModelDownload() {
	const progressToast = useToastProvider()
	const preference = usePreferenceProvider()

	async function withProgress<T>(message: string, run: () => Promise<T>): Promise<T> {
		progressToast.setMessage(message)
		progressToast.setProgress(0)
		progressToast.setOpen(true)

		let lastBytes = 0
		let lastAt = Date.now()
		const unlisten = await listen<[number, number]>('download_progress', (event) => {
			const [current, total] = event.payload
			if (total <= 0) return
			progressToast.setProgress(Math.min(100, (current / total) * 100))

			const now = Date.now()
			const elapsed = (now - lastAt) / 1000
			// Refresh the rate about once a second; the events arrive far more often.
			if (elapsed >= 1) {
				const bytesPerSecond = (current - lastBytes) / elapsed
				lastBytes = current
				lastAt = now
				const speed = formatSpeed(bytesPerSecond)
				const eta = formatEta(bytesPerSecond > 0 ? (total - current) / bytesPerSecond : NaN)
				progressToast.setMessage([message, speed, eta && `~${eta}`].filter(Boolean).join(' · '))
			}
		})

		try {
			return await run()
		} finally {
			unlisten()
			progressToast.setOpen(false)
			progressToast.setProgress(null)
			progressToast.setMessage(message)
		}
	}

	/** Install a curated catalog entry, showing its name in the progress toast. */
	function downloadCatalogModel(entry: CatalogModel) {
		return withProgress(m.downloadingModelNamed({ name: entry.name }) as string, () =>
			installCatalogModel(entry, undefined, preference.hfMirrorEnabled),
		)
	}

	return { withProgress, downloadCatalogModel }
}
