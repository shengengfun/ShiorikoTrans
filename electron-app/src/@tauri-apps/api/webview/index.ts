// Compatibility shim: @tauri-apps/api/webview
// Webview API shim for shiorikotrans's drop-modal

export function getCurrentWebview() {
	return {
		window: {
			setFocus() {},
			show() {},
			close() {},
		},
	}
}

export async function getCurrentWebviewWindow() {
	return {
		async onDragDropEvent(_callback: (event: any) => void) {
			return () => {}
		},
	}
}

