// Keep-awake via Electron powerSaveBlocker
import { keepAwake } from '~/lib/electron-adapter'

export async function startKeepAwake() {
	try {
		await keepAwake.start()
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}

export async function stopKeepAwake() {
	try {
		await keepAwake.stop()
	} catch (e) {
		console.error(`Keep awake failed: ${e}`)
	}
}
