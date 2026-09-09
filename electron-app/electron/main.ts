import { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage, dialog, Notification, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawn, ChildProcess, execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs'
import { copyFile } from 'fs/promises'
import http from 'http'
import net from 'net'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Determine if running in development or production
const isDev = !app.isPackaged

// Paths
const ROOT_DIR = isDev ? join(__dirname, '..') : dirname(app.getPath('exe'))
const BACKEND_DIR = isDev ? join(ROOT_DIR, 'backend') : join(process.resourcesPath, 'backend')
const MODELS_DIR = join(app.getPath('userData'), 'models')
const LOGS_DIR = join(app.getPath('userData'), 'logs')
const STORE_PATH = join(app.getPath('userData'), 'app_config.json')

// Ensure directories exist
mkdirSync(MODELS_DIR, { recursive: true })
mkdirSync(LOGS_DIR, { recursive: true })

// Python backend process
let pythonProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// Backend URL
const BACKEND_URL = 'http://127.0.0.1:8000'

// Store (simple JSON file-based)
function loadStore(): Record<string, any> {
	try {
		if (existsSync(STORE_PATH)) {
			return JSON.parse(readFileSync(STORE_PATH, 'utf-8'))
		}
	} catch (e) {
		console.error('Failed to load store:', e)
	}
	return {}
}

function saveStore(data: Record<string, any>) {
	try {
		writeFileSync(STORE_PATH, JSON.stringify(data, null, 2))
	} catch (e) {
		console.error('Failed to save store:', e)
	}
}

// Find Python executable
function findPython(): string {
	// In production, use bundled Python
	if (!isDev) {
		const bundledPython = join(process.resourcesPath, 'backend', 'python', getPythonExeName())
		if (existsSync(bundledPython)) {
			return bundledPython
		}
	}

	// Try python3, then python
	for (const cmd of ['python3', 'python']) {
		try {
			execSync(`${cmd} --version`, { stdio: 'pipe' })
			return cmd
		} catch {}
	}

	throw new Error('Python not found. Please install Python 3.8+.')
}

function getPythonExeName(): string {
	return process.platform === 'win32' ? 'python.exe' : 'python3'
}

// Check if backend is healthy
async function checkBackendHealth(): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(`${BACKEND_URL}/health`, (res) => {
			resolve(res.statusCode === 200)
		})
		req.on('error', () => resolve(false))
		req.setTimeout(3000, () => {
			req.destroy()
			resolve(false)
		})
	})
}

// Find available port
async function findAvailablePort(startPort: number): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = net.createServer()
		server.listen(startPort, '127.0.0.1', () => {
			const port = (server.address() as net.AddressInfo).port
			server.close(() => resolve(port))
		})
		server.on('error', () => {
			resolve(findAvailablePort(startPort + 1))
		})
	})
}

// Start Python backend
async function startPythonBackend(): Promise<void> {
	const python = findPython()
	const serverScript = join(BACKEND_DIR, 'server.py')

	if (!existsSync(serverScript)) {
		console.error('Backend server.py not found at:', serverScript)
		dialog.showErrorBox('Backend Error', 'FunASR server script not found. Please reinstall the application.')
		return
	}

	const env = {
		...process.env,
		FUNASR_MODELS_DIR: MODELS_DIR,
		FUNASR_PORT: '8000',
	}

	console.log(`Starting Python backend: ${python} ${serverScript}`)
	console.log(`Models directory: ${MODELS_DIR}`)

	pythonProcess = spawn(python, [serverScript], {
		env,
		cwd: BACKEND_DIR,
		stdio: ['pipe', 'pipe', 'pipe'],
	})

	pythonProcess.stdout?.on('data', (data: Buffer) => {
		console.log(`[FunASR] ${data.toString().trim()}`)
	})

	pythonProcess.stderr?.on('data', (data: Buffer) => {
		console.error(`[FunASR] ${data.toString().trim()}`)
	})

	pythonProcess.on('error', (err) => {
		console.error('Failed to start Python backend:', err)
		dialog.showErrorBox('Backend Error', `Failed to start FunASR service: ${err.message}`)
	})

	pythonProcess.on('exit', (code, signal) => {
		console.log(`Python backend exited with code ${code}, signal ${signal}`)
		pythonProcess = null
	})

	// Wait for backend to be ready (up to 60s for model loading)
	console.log('Waiting for FunASR backend to be ready...')
	for (let i = 0; i < 120; i++) {
		if (await checkBackendHealth()) {
			console.log('FunASR backend is ready!')
			return
		}
		await new Promise((r) => setTimeout(r, 500))
	}

	throw new Error('FunASR backend failed to start within 60 seconds')
}

// Stop Python backend
function stopPythonBackend() {
	if (pythonProcess) {
		console.log('Stopping Python backend...')
		if (process.platform === 'win32') {
			spawn('taskkill', ['/pid', String(pythonProcess.pid), '/f', '/t'])
		} else {
			pythonProcess.kill('SIGTERM')
		}
		pythonProcess = null
	}
}

// Create main window
function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		title: 'ShiorikoTrans',
		icon: join(ROOT_DIR, 'public', 'icon.png'),
		webPreferences: {
			preload: join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
		titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
		show: false,
	})

	mainWindow.on('ready-to-show', () => {
		mainWindow?.show()
	})

	mainWindow.on('closed', () => {
		mainWindow = null
	})

	// Open external links in default browser
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url)
		return { action: 'deny' }
	})

	if (isDev) {
		mainWindow.loadURL('http://localhost:1420')
		mainWindow.webContents.openDevTools()
	} else {
		mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
	}
}

// Create system tray
function createTray() {
	try {
		const iconPath = join(ROOT_DIR, 'public', 'tray-icon.png')
		if (!existsSync(iconPath)) return

		const trayIcon = nativeImage.createFromPath(iconPath)
		tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

		const contextMenu = Menu.buildFromTemplate([
			{
				label: 'Show ShiorikoTrans',
				click: () => {
					mainWindow?.show()
					mainWindow?.focus()
				},
			},
			{ type: 'separator' },
			{
				label: 'Quit',
				click: () => {
					app.quit()
				},
			},
		])

		tray.setToolTip('ShiorikoTrans')
		tray.setContextMenu(contextMenu)

		tray.on('click', () => {
			mainWindow?.show()
			mainWindow?.focus()
		})
	} catch (e) {
		console.error('Failed to create tray:', e)
	}
}

// ==================== IPC Handlers ====================

// Audio devices - get system audio devices
ipcMain.handle('get-audio-devices', async () => {
	try {
		const { execSync } = await import('child_process')
		// Use a simple approach: return a default device
		// In a real implementation, you'd use a native module or enumerate devices
		return [
			{
				isDefault: true,
				isInput: true,
				id: '0',
				name: 'Default Microphone',
			},
			{
				isDefault: true,
				isInput: false,
				id: '1',
				name: 'Default Speakers',
			},
		]
	} catch {
		return []
	}
})

// Start recording (now handled by renderer via Web Audio API)
ipcMain.handle('start-record', async (_event, options: { devices: any[]; storeInDocuments: boolean; customPath: string | null }) => {
	// Recording is now handled directly in the renderer using MediaRecorder API
	// This IPC is kept for backward compatibility
	return { success: true }
})

// Stop recording
ipcMain.handle('stop-record', async () => {
	return { success: true }
})

// Get path for saving file
ipcMain.handle('get-path-dst', async (_event, src: string, suffix: string) => {
	const path = await import('path')
	const dir = path.dirname(src)
	const ext = path.extname(src)
	const baseName = path.basename(src, ext)
	let dst = path.join(dir, `${baseName}${suffix}`)
	let counter = 1
	while (existsSync(dst)) {
		dst = path.join(dir, `${baseName} (${counter})${suffix}`)
		counter++
	}
	return dst
})

// Get models folder
ipcMain.handle('get-models-folder', async () => {
	return MODELS_DIR
})

// Open path in file manager
ipcMain.handle('open-path', async (_event, path: string) => {
	shell.showItemInFolder(path)
})

// Open URL in default browser
ipcMain.handle('open-url', async (_event, url: string) => {
	await shell.openExternal(url)
})

// Open system audio settings
ipcMain.handle('open-system-audio-settings', async () => {
	if (process.platform === 'win32') {
		execSync('start ms-settings:sound', { stdio: 'ignore' })
	} else if (process.platform === 'darwin') {
		execSync('open "x-apple.systempreferences:com.apple.preference.sound"', { stdio: 'ignore' })
	} else {
		execSync('gnome-control-center sound', { stdio: 'ignore' })
	}
})

// Get app version / commit hash
ipcMain.handle('get-commit-hash', async () => {
	return app.getVersion()
})

// Check AVX2 - no longer needed for FunASR but kept for compatibility
ipcMain.handle('is-avx2-enabled', async () => {
	return true // FunASR doesn't require AVX2
})

// Analytics
ipcMain.handle('track-analytics-event', async (_event, name: string, props?: Record<string, any>) => {
	console.log(`[Analytics] ${name}`, props || '')
})

// File operations
ipcMain.handle('read-file', async (_event, filePath: string) => {
	return readFileSync(filePath, 'utf-8')
})

ipcMain.handle('write-file', async (_event, filePath: string, data: string) => {
	writeFileSync(filePath, data)
	return true
})

ipcMain.handle('write-file-binary', async (_event, filePath: string, data: ArrayBuffer) => {
	writeFileSync(filePath, Buffer.from(data))
	return true
})

ipcMain.handle('exists', async (_event, filePath: string) => {
	return existsSync(filePath)
})

ipcMain.handle('read-dir', async (_event, dirPath: string) => {
	try {
		const entries = readdirSync(dirPath, { withFileTypes: true })
		return entries.map((entry) => ({
			name: entry.name,
			isDirectory: entry.isDirectory(),
			isFile: entry.isFile(),
		}))
	} catch {
		return []
	}
})

ipcMain.handle('remove-file', async (_event, filePath: string) => {
	try {
		unlinkSync(filePath)
		return true
	} catch {
		return false
	}
})

// Glob files
ipcMain.handle('glob-files', async (_event, folder: string, patterns: string[], recursive: boolean) => {
	const results: string[] = []
	const path = await import('path')

	function walk(dir: string) {
		try {
			const entries = readdirSync(dir, { withFileTypes: true })
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name)
				if (entry.isFile()) {
					const ext = path.extname(entry.name).toLowerCase().slice(1)
					if (patterns.some((p) => p === ext)) {
						results.push(fullPath)
					}
				} else if (entry.isDirectory() && recursive) {
					walk(fullPath)
				}
			}
		} catch {}
	}

	walk(folder)
	return results
})

// Store operations
ipcMain.handle('store-get', async (_event, key: string) => {
	const store = loadStore()
	return store[key] ?? null
})

ipcMain.handle('store-set', async (_event, key: string, value: any) => {
	const store = loadStore()
	store[key] = value
	saveStore(store)
	return true
})

ipcMain.handle('store-clear', async () => {
	saveStore({})
	return true
})

// Download file
ipcMain.handle('download-file', async (_event, url: string, destPath: string) => {
	try {
		const response = await fetch(url)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const buffer = Buffer.from(await response.arrayBuffer())
		writeFileSync(destPath, buffer)
		return destPath
	} catch (e: any) {
		throw new Error(`Download failed: ${e.message}`)
	}
})

// Download with progress
ipcMain.handle('download-model', async (_event, url: string, destPath: string) => {
	try {
		const response = await fetch(url)
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		const total = parseInt(response.headers.get('content-length') || '0', 10)
		const reader = response.body?.getReader()
		if (!reader) throw new Error('No response body')

		const chunks: Uint8Array[] = []
		let downloaded = 0

		while (true) {
			const { done, value } = await reader.read()
			if (done) break
			chunks.push(value)
			downloaded += value.length

			if (total > 0 && mainWindow) {
				const progress = (downloaded / total) * 100
				mainWindow.webContents.send('download-progress', downloaded, total)
			}
		}

		const buffer = Buffer.concat(chunks)
		writeFileSync(destPath, buffer)
		return destPath
	} catch (e: any) {
		throw new Error(`Download failed: ${e.message}`)
	}
})

// Get default recording path
ipcMain.handle('get-default-recording-path', async () => {
	return join(app.getPath('documents'), 'ShiorikoTrans Recordings')
})

// Check if crashed recently
ipcMain.handle('is-crashed-recently', async () => {
	const crashFile = join(app.getPath('temp'), 'shiorikotrans-crash.txt')
	return existsSync(crashFile)
})

// Rename crash file
ipcMain.handle('rename-crash-file', async () => {
	const crashFile = join(app.getPath('temp'), 'shiorikotrans-crash.txt')
	if (existsSync(crashFile)) {
		renameSync(crashFile, crashFile + '.old')
	}
	return true
})

// Get logs
ipcMain.handle('get-logs', async () => {
	const logPath = join(LOGS_DIR, 'app.log')
	if (existsSync(logPath)) {
		return readFileSync(logPath, 'utf-8')
	}
	return ''
})

// Show logs folder
ipcMain.handle('show-log-path', async () => {
	shell.openPath(LOGS_DIR)
})

// Show temp folder
ipcMain.handle('show-temp-path', async () => {
	shell.openPath(app.getPath('temp'))
})

// Is online check
ipcMain.handle('is-online', async () => {
	try {
		await fetch('https://1.1.1.1', { method: 'HEAD', signal: AbortSignal.timeout(3000) })
		return true
	} catch {
		return false
	}
})

// Notification permission (always granted in Electron)
ipcMain.handle('plugin:notification|is_permission_granted', async () => {
	return Notification.isSupported()
})

ipcMain.handle('plugin:notification|request_permission', async () => {
	return Notification.isSupported() ? 'granted' : 'denied'
})

// Send notification
ipcMain.handle('plugin:notification|notify', async (_event, options: { title: string; body: string }) => {
	if (Notification.isSupported()) {
		new Notification({ title: options.title, body: options.body }).show()
	}
	return true
})

// Type text (hotkey mode) - uses clipboard as fallback
ipcMain.handle('type-text', async (_event, text: string) => {
	const { clipboard } = await import('electron')
	clipboard.writeText(text)
	// In a real app, you'd use robotjs or similar for actual keystroke simulation
	return true
})

// Resolve resource path (for locales)
ipcMain.handle('resolve-resource', async (_event, resourcePath: string) => {
	if (isDev) {
		return join(ROOT_DIR, 'public', resourcePath)
	}
	return join(process.resourcesPath, resourcePath)
})

// Get system locale
ipcMain.handle('get-locale', async () => {
	return app.getLocale()
})

// Select files dialog
ipcMain.handle('dialog-open', async (_event, options: any) => {
	const result = await dialog.showOpenDialog(mainWindow!, {
		properties: options?.directory
			? ['openDirectory' as const]
			: ['openFile' as const, ...(options?.multiple ? ['multiSelections' as const] : [])],
		filters: options?.filters,
	})
	return result.canceled ? null : result.filePaths
})

// Save file dialog
ipcMain.handle('dialog-save', async (_event, options: any) => {
	const result = await dialog.showSaveDialog(mainWindow!, {
		defaultPath: options.defaultPath,
		filters: options.filters,
	})
	return result.canceled ? null : result.filePath
})

// Message dialog
ipcMain.handle('dialog-message', async (_event, message: string, options: any) => {
	await dialog.showMessageBox(mainWindow!, {
		message,
		type: options?.kind || 'info',
		title: options?.title,
	})
})

// Ask dialog (yes/no)
ipcMain.handle('dialog-ask', async (_event, message: string, options: any) => {
	const result = await dialog.showMessageBox(mainWindow!, {
		message,
		type: options?.kind || 'info',
		title: options?.title,
		buttons: [options?.okLabel || 'OK', options?.cancelLabel || 'Cancel'],
		defaultId: 0,
		cancelId: 1,
	})
	return result.response === 0
})

// Get argv
ipcMain.handle('get-argv', async () => {
	return process.argv
})

// Keep screen awake
let powerSaveBlockerId: number | null = null
ipcMain.handle('start-keep-awake', async () => {
	if (powerSaveBlockerId === null) {
		powerSaveBlockerId = (await import('electron')).powerSaveBlocker.start('prevent-display-sleep')
	}
})

ipcMain.handle('stop-keep-awake', async () => {
	if (powerSaveBlockerId !== null) {
		(await import('electron')).powerSaveBlocker.stop(powerSaveBlockerId)
		powerSaveBlockerId = null
	}
})

// ==================== App lifecycle ====================

app.whenReady().then(async () => {
	console.log('ShiorikoTrans Electron app starting...')

	// Start Python backend
	try {
		await startPythonBackend()
	} catch (e: any) {
		console.error('Backend startup failed:', e.message)
		dialog.showErrorBox('Backend Error', `Failed to start FunASR service: ${e.message}\n\nThe app will still open but transcription won't work.`)
	}

	// Create window
	createMainWindow()
	createTray()

	// Register global shortcut (CmdOrCtrl+Shift+V)
	try {
		globalShortcut.register('CommandOrControl+Shift+V', () => {
			mainWindow?.webContents.send('hotkey-triggered')
		})
	} catch (e) {
		console.error('Failed to register global shortcut:', e)
	}

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createMainWindow()
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})

app.on('before-quit', () => {
	globalShortcut.unregisterAll()
	stopPythonBackend()
})

app.on('will-quit', () => {
	stopPythonBackend()
})
