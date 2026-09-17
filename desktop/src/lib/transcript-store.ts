import { load } from '@tauri-apps/plugin-store'
import type { Segment } from '~/lib/transcript'

/**
 * Transcript snapshots for the "recent" list.
 *
 * Recording only the source path made the recent list useless: reopening an
 * entry threw the transcript away and asked for a full re-run. The segments
 * (plus the translated/summarised variants) are stored here so a recent item
 * restores the text immediately — and keeps working after the source file was
 * moved or deleted.
 *
 * Backed by the store plugin (already permitted in `capabilities/main.json`),
 * keyed by source path so it lines up with `preference.recentFiles`.
 */
const STORE_FILE = 'transcripts.json'
const STORE_KEY = 'transcripts'
const VERSION = 1
/** The recent list keeps 12 entries, so older snapshots are dead weight. */
const MAX_ENTRIES = 12
/** Serialized budget; once exceeded the oldest snapshots lose their content. */
const MAX_CHARS = 6_000_000

export interface TranscriptSnapshot {
	/** Source file the transcript belongs to. */
	path: string
	name: string
	ts: number
	segments: Segment[]
	translatedSegments: Segment[] | null
	summary: Segment[] | null
}

export interface TranscriptSummary {
	segments: number
	chars: number
	ts: number
	hasTranslation: boolean
	hasSummary: boolean
	/** First characters of the transcript, so a list can show what it contains. */
	preview: string
}

interface StoreShape {
	version: number
	entries: Record<string, TranscriptSnapshot>
}

async function readStore(): Promise<StoreShape> {
	try {
		const store = await load(STORE_FILE, { defaults: {}, autoSave: false })
		const raw = await store.get<StoreShape>(STORE_KEY)
		if (raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object') {
			return { version: raw.version ?? VERSION, entries: raw.entries }
		}
	} catch (error) {
		console.error('failed to read transcript store:', error)
	}
	return { version: VERSION, entries: {} }
}

async function writeStore(shape: StoreShape): Promise<void> {
	const store = await load(STORE_FILE, { defaults: {}, autoSave: false })
	await store.set(STORE_KEY, shape)
	await store.save()
}

function charCount(segments: Segment[] | null | undefined) {
	return (segments ?? []).reduce((total, segment) => total + segment.text.length, 0)
}

/** First readable line of a transcript, trimmed for list display. */
function previewOf(snapshot: TranscriptSnapshot) {
	const first = snapshot.segments.find((segment) => segment.text.trim().length > 0)?.text ?? snapshot.segments[0]?.text ?? ''
	return first.replace(/\s+/g, ' ').trim().slice(0, 90)
}

function snapshotSize(snapshot: TranscriptSnapshot) {
	return charCount(snapshot.segments) + charCount(snapshot.translatedSegments) + charCount(snapshot.summary)
}

/** Keep the newest snapshots within the count and size budget. */
function prune(entries: Record<string, TranscriptSnapshot>) {
	const ordered = Object.values(entries).sort((a, b) => b.ts - a.ts)
	const kept: Record<string, TranscriptSnapshot> = {}
	let budget = MAX_CHARS
	for (const snapshot of ordered.slice(0, MAX_ENTRIES)) {
		budget -= snapshotSize(snapshot)
		// Keep the entry, drop the payload — the recent row then offers "file only".
		kept[snapshot.path] = budget > 0 ? snapshot : { ...snapshot, segments: [], translatedSegments: null, summary: null }
	}
	return kept
}

/** Cheap content signature: avoids rewriting the store on every debounce tick. */
function signatureOf(segments: Segment[] | null | undefined, extra?: Segment[] | null) {
	const main = segments ?? []
	const last = main[main.length - 1]
	return [main.length, extra?.length ?? 0, main.reduce((total, segment) => total + segment.text.length, 0) + (extra?.reduce((total, segment) => total + segment.text.length, 0) ?? 0), last?.stop ?? 0].join(':')
}

/** Store (or refresh) the transcript belonging to a source file. */
export async function saveTranscriptSnapshot(snapshot: Omit<TranscriptSnapshot, 'ts'>): Promise<void> {
	const empty = snapshot.segments.length === 0 && !snapshot.translatedSegments?.length && !snapshot.summary?.length
	if (empty) return
	try {
		const shape = await readStore()
		const previous = shape.entries[snapshot.path]
		// Nothing changed since the last flush (e.g. a re-render) — keep the ts.
		if (previous) {
			const same =
				signatureOf(previous.segments, previous.translatedSegments) === signatureOf(snapshot.segments, snapshot.translatedSegments) &&
				signatureOf(previous.summary) === signatureOf(snapshot.summary)
			if (same) return
		}
		shape.entries[snapshot.path] = { ...snapshot, ts: Date.now() }
		shape.version = VERSION
		await writeStore({ version: VERSION, entries: prune(shape.entries) })
	} catch (error) {
		console.error('failed to save transcript snapshot:', error)
	}
}

export async function loadTranscriptSnapshot(path: string): Promise<TranscriptSnapshot | null> {
	if (!path) return null
	const shape = await readStore()
	const snapshot = shape.entries[path]
	if (!snapshot) return null
	if (snapshot.segments.length === 0 && !snapshot.summary?.length && !snapshot.translatedSegments?.length) return null
	return snapshot
}

export async function deleteTranscriptSnapshot(path: string): Promise<void> {
	try {
		const shape = await readStore()
		if (!shape.entries[path]) return
		delete shape.entries[path]
		await writeStore(shape)
	} catch (error) {
		console.error('failed to delete transcript snapshot:', error)
	}
}

export async function clearTranscriptSnapshots(): Promise<void> {
	try {
		await writeStore({ version: VERSION, entries: {} })
	} catch (error) {
		console.error('failed to clear transcript snapshots:', error)
	}
}

/** Light metadata for every stored transcript, keyed by source path. */
export async function listTranscriptSnapshots(): Promise<Record<string, TranscriptSummary>> {
	const shape = await readStore()
	const result: Record<string, TranscriptSummary> = {}
	for (const snapshot of Object.values(shape.entries)) {
		if (snapshot.segments.length === 0 && !snapshot.summary?.length && !snapshot.translatedSegments?.length) continue
		result[snapshot.path] = {
			segments: snapshot.segments.length,
			chars: charCount(snapshot.segments),
			ts: snapshot.ts,
			hasTranslation: Boolean(snapshot.translatedSegments?.length),
			hasSummary: Boolean(snapshot.summary?.length),
			preview: previewOf(snapshot),
		}
	}
	return result
}
