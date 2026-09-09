import { contextBridge, ipcRenderer } from 'electron'

// Bridge API exposed to the renderer process
// This replaces @tauri-apps/api patterns used by shiorikotrans

const electronAPI = {
	// Core invoke replacement
	invoke: async (command: string, args?: Record<string, any>): Promise<any> => {
		// Map Tauri commands to Electron IPC
		const commandMap: Record<string, string> = {
			'transcribe': 'transcribe',
			'load_model': 'load-model',
			'start_record': 'start-record',
			'stop_record': 'stop-record',
			'get_audio_devices': 'get-audio-devices',
			'is_avx2_enabled': 'is-avx2-enabled',
			'get_models_folder': 'get-models-folder',
			'download_model': 'download-model',
			'download_file': 'download-file',
			'glob_files': 'glob-files',
			'get_path_dst': 'get-path-dst',
			'open_path': 'open-path',
			'open_system_audio_settings': 'open-system-audio-settings',
			'track_analytics_event': 'track-analytics-event',
			'plugin:notification|is_permission_granted': 'plugin:notification|is_permission_granted',
			'plugin:notification|request_permission': 'plugin:notification|request_permission',
			'plugin:notification|notify': 'plugin:notification|notify',
			'type_text': 'type-text',
			'is_crashed_recently': 'is-crashed-recently',
			'rename_crash_file': 'rename-crash-file',
			'get_commit_hash': 'get-commit-hash',
			'get_logs': 'get-logs',
			'show_log_path': 'show-log-path',
			'show_temp_path': 'show-temp-path',
			'is_online': 'is-online',
			'get_logs_folder': 'get-logs-folder',
			'get_default_recording_path': 'get-default-recording-path',
			'get_argv': 'get-argv',
		}

		const channel = commandMap[command] || command
		return ipcRenderer.invoke(channel, args)
	},

	// Event system (replaces Tauri listen/emit)
	on: (event: string, callback: (...args: any[]) => void) => {
		const handler = (_event: any, ...args: any[]) => callback(...args)
		ipcRenderer.on(event, handler)
		return () => {
			ipcRenderer.removeListener(event, handler)
		}
	},

	emit: (event: string, ...args: any[]) => {
		ipcRenderer.send(event, ...args)
	},

	// File system operations
	fs: {
		readTextFile: async (path: string): Promise<string> => {
			return ipcRenderer.invoke('read-file', path)
		},
		writeTextFile: async (path: string, contents: string): Promise<void> => {
			await ipcRenderer.invoke('write-file', path, contents)
		},
		writeFile: async (path: string, contents: Uint8Array): Promise<void> => {
			await ipcRenderer.invoke('write-file-binary', path, contents.buffer)
		},
		exists: async (path: string): Promise<boolean> => {
			return ipcRenderer.invoke('exists', path)
		},
		readDir: async (path: string): Promise<{ name: string; isDirectory: boolean; isFile: boolean }[]> => {
			return ipcRenderer.invoke('read-dir', path)
		},
		remove: async (path: string): Promise<void> => {
			await ipcRenderer.invoke('remove-file', path)
		},
	},

	// Path operations (simplified - uses basic string manipulation)
	path: {
		basename: async (filePath: string): Promise<string> => {
			return filePath.replace(/\\/g, '/').split('/').pop() || filePath
		},
		dirname: async (filePath: string): Promise<string> => {
			const parts = filePath.replace(/\\/g, '/').split('/')
			parts.pop()
			return parts.join('/') || '/'
		},
		extname: async (filePath: string): Promise<string> => {
			const idx = filePath.lastIndexOf('.')
			return idx >= 0 ? filePath.slice(idx) : ''
		},
		join: async (...paths: string[]): Promise<string> => {
			return paths.join('/').replace(/\/+/g, '/')
		},
		resolveResource: async (resourcePath: string): Promise<string> => {
			return ipcRenderer.invoke('resolve-resource', resourcePath)
		},
	},

	// Dialog operations
	dialog: {
		open: async (options?: any): Promise<string | string[] | null> => {
			return ipcRenderer.invoke('dialog-open', options)
		},
		save: async (options?: any): Promise<string | null> => {
			return ipcRenderer.invoke('dialog-save', options)
		},
		message: async (message: string, options?: any): Promise<void> => {
			await ipcRenderer.invoke('dialog-message', message, options)
		},
		ask: async (message: string, options?: any): Promise<boolean> => {
			return ipcRenderer.invoke('dialog-ask', message, options)
		},
	},

	// Shell operations
	shell: {
		open: async (url: string): Promise<void> => {
			await ipcRenderer.invoke('open-url', url)
		},
	},

	// Convert file path to URL for local audio playback
	convertFileSrc: (filePath: string): string => {
		// In Electron, we can use file:// protocol directly
		return `file:///${filePath.replace(/\\/g, '/')}`
	},

	// Locale
	locale: async (): Promise<string> => {
		return ipcRenderer.invoke('get-locale')
	},

	// Window control
	window: {
		setTitle: async (title: string): Promise<void> => {
			ipcRenderer.send('set-title', title)
		},
		unminimize: async (): Promise<void> => {
			ipcRenderer.send('unminimize-window')
		},
		setFocus: async (): Promise<void> => {
			ipcRenderer.send('focus-window')
		},
	},

	// Keep awake
	keepAwake: {
		start: async (): Promise<void> => {
			await ipcRenderer.invoke('start-keep-awake')
		},
		stop: async (): Promise<void> => {
			await ipcRenderer.invoke('stop-keep-awake')
		},
	},

	// Backend URL (FunASR service)
	getBackendUrl: (): string => {
		return 'http://127.0.0.1:8000'
	},

	// Store (for analytics settings)
	store: {
		get: async (key: string): Promise<any> => {
			return ipcRenderer.invoke('store-get', key)
		},
		set: async (key: string, value: any): Promise<void> => {
			await ipcRenderer.invoke('store-set', key, value)
		},
		clear: async (): Promise<void> => {
			await ipcRenderer.invoke('store-clear')
		},
	},

	// Clipboard
	clipboard: {
		writeText: async (text: string): Promise<void> => {
			await ipcRenderer.invoke('write-clipboard', text)
		},
	},

	// App info
	appInfo: {
		name: 'shiorikotrans-electron',
		version: '0.0.0',
	},
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration
export type ElectronAPI = typeof electronAPI
