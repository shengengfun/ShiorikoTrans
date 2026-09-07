// Compatibility shim: tauri-plugin-keepawake-api
// Replaced by Electron's powerSaveBlocker via adapter
import { keepAwake } from '~/lib/electron-adapter'

export function start(options?: any) {
	keepAwake.start()
}

export function stop() {
	keepAwake.stop()
}
