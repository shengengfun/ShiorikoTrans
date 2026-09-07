// Compatibility shim: @tauri-apps/api/webviewWindow
export { webview } from '~/lib/electron-adapter'

export function getCurrentWebviewWindow() {
	return {
		async show() {
			// Electron windows are already shown
		},
		async unminimize() {
			const { webview } = await import('~/lib/electron-adapter')
			return webview.getCurrentWebviewWindow().unminimize()
		},
		async setFocus() {
			const { webview } = await import('~/lib/electron-adapter')
			return webview.getCurrentWebviewWindow().setFocus()
		},
		async close() {
			window.close()
		},
		async destroy() {
			window.close()
		},
		async listen(event: string, handler: (...args: any[]) => void): Promise<() => void> {
			const wrappedHandler = (e: Event) => handler(e)
			window.addEventListener(event, wrappedHandler)
			return () => window.removeEventListener(event, wrappedHandler)
		},
		isMinimized(): Promise<boolean> {
			return Promise.resolve(false)
		},
		isVisible(): Promise<boolean> {
			return Promise.resolve(true)
		},
	}
}
