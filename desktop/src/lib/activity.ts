export type ActivityPhase = 'idle' | 'transcribing' | 'translating' | 'downloading'

export interface ActivityState {
	phase: ActivityPhase
	progress?: number | null
	index?: number
	total?: number
	label?: string
}

type Listener = (state: ActivityState | null) => void

let current: ActivityState | null = null
const listeners = new Set<Listener>()

export function setActivity(state: ActivityState | null) {
	current = state
	for (const listener of listeners) listener(state)
}

export function subscribeActivity(listener: Listener): () => void {
	listeners.add(listener)
	listener(current)
	return () => {
		listeners.delete(listener)
	}
}
