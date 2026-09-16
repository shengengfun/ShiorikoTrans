import { exists } from '@tauri-apps/plugin-fs'
import type { RecentFile } from '~/providers/preference'

/**
 * Recent transcript sources are plain filesystem paths, but not every path we
 * record survives the session:
 *
 * - a recording only lands in Documents when "save to Documents" is on,
 *   otherwise it stays in `<temp>/shiorikotrans_temp*` and is deleted on the
 *   next launch (`cleaner.rs`),
 * - yt-dlp downloads live in `<temp>/shiorikotrans-download-*` under the same
 *   rule.
 *
 * Those entries used to be listed forever and failed silently when clicked —
 * the "shows a file but cannot read it" bug. Keeping the check here lets every
 * caller (title bar, settings) mark or drop dead entries instead.
 */
export function isTemporaryPath(path: string) {
	return /[\\/]shiorikotrans[-_]?temp/i.test(path) || /[\\/]shiorikotrans-download-/i.test(path)
}

/** `true` when the file is still on disk (missing/denied paths count as gone). */
export async function recentFileExists(path: string): Promise<boolean> {
	if (!path) return false
	try {
		return await exists(path)
	} catch {
		return false
	}
}

/**
 * Paths of the entries whose file disappeared. Checked in parallel because the
 * list is capped at 12 entries.
 */
export async function findMissingRecents(files: RecentFile[]): Promise<Set<string>> {
	const results = await Promise.all(files.map(async (file) => [file.path, await recentFileExists(file.path)] as const))
	return new Set(results.filter(([, found]) => !found).map(([path]) => path))
}

/** Recent files, newest first. */
export function sortRecents(files: RecentFile[]) {
	return [...files].sort((a, b) => b.ts - a.ts)
}
