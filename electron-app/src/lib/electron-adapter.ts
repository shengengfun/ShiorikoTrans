/**
 * Adapter layer: Replaces @tauri-apps/api imports with Electron equivalents.
 *
 * This file provides drop-in replacements for Tauri APIs used by shiorikotrans,
 * enabling the frontend to work unchanged with Electron as the desktop shell.
 */

// ==================== Core invoke replacement ====================

/**
 * Replacement for Tauri's invoke() function.
 * Routes calls to Electron IPC or directly to the FunASR backend.
 */
export async function invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
	const api = getElectronAPI()

	// Commands that go to the FunASR backend directly
	if (command === 'transcribe') {
		return transcribeViaFunASR(args?.options) as T
	}

	if (command === 'load_model') {
		// FunASR loads models on demand - just validate we can reach the backend
		const healthy = await checkBackendHealth()
		if (!healthy) {
			throw new Error('FunASR backend is not running. Please start the service.')
		}
		return 'ok' as T
	}

	// Commands routed through Electron IPC
	if (api?.invoke) {
		return api.invoke(command, args)
	}

	throw new Error(`Command not available in Electron: ${command}`)
}

// ==================== FunASR Backend Communication ====================

const BACKEND_URL = 'http://127.0.0.1:8000'

async function checkBackendHealth(): Promise<boolean> {
	try {
		const res = await fetch(`${BACKEND_URL}/health`, {
			signal: AbortSignal.timeout(3000),
		})
		return res.ok
	} catch {
		return false
	}
}

/**
 * Send audio file to FunASR backend for transcription.
 * Returns shiorikotrans-compatible Transcript format.
 */
async function transcribeViaFunASR(options: any): Promise<any> {
	const { path, lang, word_timestamps, max_sentence_len } = options || {}

	// Read the audio file
	const api = getElectronAPI()
	let fileBlob: Blob

	if (api?.fs?.readFileBinary) {
		const buffer = await api.fs.readFileBinary(path)
		fileBlob = new Blob([buffer])
	} else {
		// Fallback: fetch the file via file:// protocol
		const response = await fetch(`file:///${path.replace(/\\/g, '/')}`)
		fileBlob = await response.blob()
	}

	// Build FormData
	const formData = new FormData()
	const fileName = path.split(/[/\\]/).pop() || 'audio.wav'
	formData.append('file', fileBlob, fileName)

	// Build query string
	const params = new URLSearchParams()
	if (lang) params.set('language', lang)
	if (word_timestamps) params.set('word_timestamps', 'true')
	if (max_sentence_len) params.set('max_sentence_len', String(max_sentence_len))

	const url = `${BACKEND_URL}/transcribe?${params.toString()}`

	const res = await fetch(url, {
		method: 'POST',
		body: formData,
	})

	if (!res.ok) {
		const errorText = await res.text()
		let errorData: any
		try {
			errorData = JSON.parse(errorText)
		} catch {
			errorData = { detail: errorText }
		}
		throw new Error(errorData.detail || `Transcription failed: ${res.status}`)
	}

	const result = await res.json()

	// Convert to shiorikotrans-compatible Transcript format
	// FunASR returns segments with start/stop in seconds
	// ShiorikoTrans expects start/stop as hundredths of a second (multiplied by 100)
	return {
		segments: (result.segments || []).map((seg: any) => ({
			start: Math.round((seg.start || 0) * 100),
			stop: Math.round((seg.stop || 0) * 100),
			text: seg.text || '',
			speaker: seg.speaker ?? undefined,
		})),
		word_segments: (result.word_segments || []).map((seg: any) => ({
			start: Math.round((seg.start || 0) * 100),
			stop: Math.round((seg.stop || 0) * 100),
			text: seg.text || '',
			speaker: seg.speaker ?? undefined,
		})),
		processing_time: {
			secs: Math.floor(result.processing_time_sec || 0),
			nanos: ((result.processing_time_sec || 0) % 1) * 1_000_000_000,
		},
	}
}

// ==================== Electron API access ====================

interface ElectronAPI {
	invoke: (command: string, args?: any) => Promise<any>
	on: (event: string, callback: (...args: any[]) => void) => () => void
	emit: (event: string, ...args: any[]) => void
	fs: {
		readTextFile: (path: string) => Promise<string>
		writeTextFile: (path: string, contents: string) => Promise<void>
		writeFile: (path: string, contents: Uint8Array) => Promise<void>
		readFileBinary: (path: string) => Promise<ArrayBuffer>
		exists: (path: string) => Promise<boolean>
		readDir: (path: string) => Promise<any[]>
		remove: (path: string) => Promise<void>
	}
	path: {
		basename: (path: string) => Promise<string>
		dirname: (path: string) => Promise<string>
		extname: (path: string) => Promise<string>
		join: (...paths: string[]) => Promise<string>
		resolveResource: (resourcePath: string) => Promise<string>
	}
	dialog: {
		open: (options?: any) => Promise<string | string[] | null>
		save: (options?: any) => Promise<string | null>
		message: (message: string, options?: any) => Promise<void>
		ask: (message: string, options?: any) => Promise<boolean>
	}
	shell: {
		open: (url: string) => Promise<void>
	}
	convertFileSrc: (filePath: string) => string
	locale: () => Promise<string>
	window: {
		setTitle: (title: string) => Promise<void>
		unminimize: () => Promise<void>
		setFocus: () => Promise<void>
	}
	keepAwake: {
		start: () => Promise<void>
		stop: () => Promise<void>
	}
	getBackendUrl: () => string
	store: {
		get: (key: string) => Promise<any>
		set: (key: string, value: any) => Promise<void>
		clear: () => Promise<void>
	}
	clipboard: {
		writeText: (text: string) => Promise<void>
	}
	appInfo: {
		name: string
		version: string
	}
}

function getElectronAPI(): ElectronAPI | null {
	if (typeof window !== 'undefined' && (window as any).electronAPI) {
		return (window as any).electronAPI as ElectronAPI
	}
	return null
}

// ==================== Event system (replaces Tauri listen/emit) ====================

/**
 * Replacement for @tauri-apps/api/event listen()
 * Tauri signature: listen<T>(event: string, callback: (event: { payload: T }) => void)
 */
export async function listen<T = any>(
	event: string,
	callback: (event: { payload: T }) => void,
): Promise<() => void> {
	const api = getElectronAPI()
	if (api?.on) {
		return api.on(event, (_event: any, payload: T) => callback({ payload }))
	}

	// Fallback: use DOM events for in-browser mode
	const handler = (e: CustomEvent<T>) => callback({ payload: e.detail } as any)
	window.addEventListener(event, handler as EventListener)
	return () => window.removeEventListener(event, handler as EventListener)
}

/**
 * Replacement for @tauri-apps/api/event emit()
 */
export async function emit(event: string, payload?: any): Promise<void> {
	const api = getElectronAPI()
	if (api?.emit) {
		api.emit(event, payload)
		return
	}

	// Fallback: use DOM events
	window.dispatchEvent(new CustomEvent(event, { detail: payload }))
}

// ==================== Path utilities ====================

/**
 * Replacement for @tauri-apps/api/path functions
 */
export const path = {
	async basename(filePath: string): Promise<string> {
		const api = getElectronAPI()
		if (api?.path?.basename) return api.path.basename(filePath)
		return filePath.split(/[/\\]/).pop() || filePath
	},

	async dirname(filePath: string): Promise<string> {
		const api = getElectronAPI()
		if (api?.path?.dirname) return api.path.dirname(filePath)
		const parts = filePath.replace(/\\/g, '/').split('/')
		parts.pop()
		return parts.join('/') || '/'
	},

	async extname(filePath: string): Promise<string> {
		const idx = filePath.lastIndexOf('.')
		return idx >= 0 ? filePath.slice(idx) : ''
	},

	async join(...paths: string[]): Promise<string> {
		return paths.join('/').replace(/\/+/g, '/')
	},

	async resolveResource(resourcePath: string): Promise<string> {
		const api = getElectronAPI()
		if (api?.path?.resolveResource) return api.path.resolveResource(resourcePath)
		return resourcePath
	},
}

// ==================== File system utilities ====================

/**
 * Replacement for @tauri-apps/plugin-fs functions
 */
export const fs = {
	async readTextFile(path: string): Promise<string> {
		const api = getElectronAPI()
		if (api?.fs?.readTextFile) return api.fs.readTextFile(path)
		const res = await fetch(`file:///${path.replace(/\\/g, '/')}`)
		return res.text()
	},

	async writeTextFile(path: string, contents: string): Promise<void> {
		const api = getElectronAPI()
		if (api?.fs?.writeTextFile) return api.fs.writeTextFile(path, contents)
		throw new Error('writeTextFile not available in browser mode')
	},

	async writeFile(path: string, contents: Uint8Array): Promise<void> {
		const api = getElectronAPI()
		if (api?.fs?.writeFile) return api.fs.writeFile(path, contents)
		throw new Error('writeFile not available in browser mode')
	},

	async exists(path: string): Promise<boolean> {
		const api = getElectronAPI()
		if (api?.fs?.exists) return api.fs.exists(path)
		try {
			const res = await fetch(`file:///${path.replace(/\\/g, '/')}`, { method: 'HEAD' })
			return res.ok
		} catch {
			return false
		}
	},

	async readDir(dirPath: string): Promise<{ name: string }[]> {
		const api = getElectronAPI()
		if (api?.fs?.readDir) {
			const entries = await api.fs.readDir(dirPath)
			return entries.map((e: any) => ({ name: e.name }))
		}
		return []
	},

	async remove(path: string): Promise<void> {
		const api = getElectronAPI()
		if (api?.fs?.remove) return api.fs.remove(path)
		throw new Error('remove not available in browser mode')
	},
}

// ==================== Dialog utilities ====================

/**
 * Replacement for @tauri-apps/plugin-dialog
 */
export const dialog = {
	async open(options?: any): Promise<string | string[] | null> {
		const api = getElectronAPI()
		if (api?.dialog?.open) return api.dialog.open(options)

		// Fallback: use HTML file input
		return new Promise((resolve) => {
			const input = document.createElement('input')
			input.type = 'file'
			if (options?.multiple) input.multiple = true
			if (options?.directory) {
				;(input as any).webkitdirectory = true
			}
			if (options?.filters) {
				const exts = options.filters.flatMap((f: any) => f.extensions).join(',')
				input.accept = exts
			}
			input.onchange = () => {
				const files = Array.from(input.files || []).map((f: any) => f.path || f.name)
				resolve(options?.multiple ? files : files[0] || null)
			}
			input.click()
		})
	},

	async save(options?: any): Promise<string | null> {
		const api = getElectronAPI()
		if (api?.dialog?.save) return api.dialog.save(options)
		return null
	},

	async message(message: string, options?: any): Promise<void> {
		const api = getElectronAPI()
		if (api?.dialog?.message) return api.dialog.message(message, options)
		alert(message)
	},

	async ask(message: string, options?: any): Promise<boolean> {
		const api = getElectronAPI()
		if (api?.dialog?.ask) return api.dialog.ask(message, options)
		return confirm(message)
	},
}

// ==================== Shell / Opener ====================

/**
 * Replacement for @tauri-apps/plugin-opener
 */
export async function openUrl(url: string): Promise<void> {
	const api = getElectronAPI()
	if (api?.shell?.open) {
		await api.shell.open(url)
	} else {
		window.open(url, '_blank')
	}
}

// ==================== Window utilities ====================

/**
 * Replacement for @tauri-apps/api/webviewWindow
 */
export const webview = {
	getCurrentWebviewWindow() {
		return {
			async show() {
				// Electron window is already shown
			},
			async unminimize() {
				const api = getElectronAPI()
				await api?.window?.unminimize()
			},
			async setFocus() {
				const api = getElectronAPI()
				await api?.window?.setFocus()
			},
		}
	},
}

// ==================== OS / Locale ====================

/**
 * Replacement for @tauri-apps/plugin-os locale()
 */
export async function locale(): Promise<string | null> {
	const api = getElectronAPI()
	if (api?.locale) return api.locale()
	return navigator.language || 'en-US'
}

// ==================== Clipboard ====================

/**
 * Replacement for @tauri-apps/plugin-clipboard-manager
 */
export const clipboard = {
	async writeText(text: string): Promise<void> {
		const api = getElectronAPI()
		if (api?.clipboard?.writeText) {
			await api.clipboard.writeText(text)
		} else {
			await navigator.clipboard.writeText(text)
		}
	},
}

// ==================== Convert file path to URL ====================

export function convertFileSrc(filePath: string): string {
	const api = getElectronAPI()
	if (api?.convertFileSrc) return api.convertFileSrc(filePath)
	return `file:///${filePath.replace(/\\/g, '/')}`
}

// ==================== Keep awake ====================

export const keepAwake = {
	async start(): Promise<void> {
		const api = getElectronAPI()
		await api?.keepAwake?.start()
	},
	async stop(): Promise<void> {
		const api = getElectronAPI()
		await api?.keepAwake?.stop()
	},
}

// ==================== Store (persistent config) ====================

class StoreAdapter {
	private filename: string

	constructor(filename: string) {
		this.filename = filename
	}

	async get<T = any>(key: string): Promise<T | undefined> {
		const api = getElectronAPI()
		if (api?.store?.get) {
			const all = await api.store.get('*') || {}
			return all[key]
		}
		const raw = localStorage.getItem(`store:${this.filename}:${key}`)
		return raw ? JSON.parse(raw) : undefined
	}

	async set(key: string, value: any): Promise<void> {
		const api = getElectronAPI()
		if (api?.store?.set) {
			await api.store.set(key, value)
			return
		}
		localStorage.setItem(`store:${this.filename}:${key}`, JSON.stringify(value))
	}

	async save(): Promise<void> {
		// Electron store saves immediately
	}

	async clear(): Promise<void> {
		const api = getElectronAPI()
		if (api?.store?.clear) {
			await api.store.clear()
			return
		}
	}
}

export async function load(filename: string): Promise<StoreAdapter> {
	return new StoreAdapter(filename)
}

// ==================== Global Shortcut (via Electron) ====================

export const globalShortcut = {
	async register(shortcut: string, callback: (event: { state: 'Pressed' | 'Released' }) => void): Promise<void> {
		const api = getElectronAPI()
		if (api?.on) {
			api.on('hotkey-triggered', () => callback({ state: 'Pressed' }))
		}
	},

	async unregister(shortcut: string): Promise<void> {
		// Electron handles this in main process
	},

	async isRegistered(shortcut: string): Promise<boolean> {
		return false
	},
}

// ==================== Deep link ====================

export const deepLink = {
	async onOpenUrl(callback: (urls: string[]) => void): Promise<() => void> {
		// Not implemented in Electron yet
		return () => {}
	},
}

// ==================== App info (replaces @tauri-apps/api app module) ====================

export const app = {
	async getVersion(): Promise<string> {
		const api = getElectronAPI()
		return api?.appInfo?.version || '0.0.0'
	},
	async getName(): Promise<string> {
		const api = getElectronAPI()
		return api?.appInfo?.name || 'shiorikotrans'
	},
}

// ==================== Event namespace (for barrel import) ====================

export const event = {
	listen,
	emit,
}
