import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		svgr({
			svgrOptions: { exportType: 'named', ref: true, svgo: false, titleProp: true },
			include: '**/*.svg',
		}),
		electron([
			{
				entry: 'electron/main.ts',
				vite: {
					build: {
						outDir: 'dist-electron',
						rollupOptions: {
							external: ['electron', 'electron-store'],
						},
					},
				},
			},
			{
				entry: 'electron/preload.ts',
				onstart(args) {
					args.reload()
				},
				vite: {
					build: {
						outDir: 'dist-electron',
						rollupOptions: {
							external: ['electron'],
						},
					},
				},
			},
		]),
		electronRenderer(),
	],
	resolve: {
		alias: [
			{ find: '~', replacement: resolve(__dirname, 'src') },
			{ find: '@tauri-apps/api/core', replacement: resolve(__dirname, 'src/@tauri-apps/api/core.ts') },
			{ find: '@tauri-apps/api/event', replacement: resolve(__dirname, 'src/@tauri-apps/api/event.ts') },
			{ find: '@tauri-apps/api/path', replacement: resolve(__dirname, 'src/@tauri-apps/api/path.ts') },
			{ find: '@tauri-apps/api/webviewWindow', replacement: resolve(__dirname, 'src/@tauri-apps/api/webviewWindow/index.ts') },
			{ find: '@tauri-apps/api/webview', replacement: resolve(__dirname, 'src/@tauri-apps/api/webview/index.ts') },
			{ find: '@tauri-apps/api', replacement: resolve(__dirname, 'src/@tauri-apps/api/index.ts') },
			{ find: '@tauri-apps/plugin-fs', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-fs/index.ts') },
			{ find: '@tauri-apps/plugin-dialog', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-dialog/index.ts') },
			{ find: '@tauri-apps/plugin-os', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-os/index.ts') },
			{ find: '@tauri-apps/plugin-store', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-store/index.ts') },
			{ find: '@tauri-apps/plugin-opener', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-opener/index.ts') },
			{ find: '@tauri-apps/plugin-clipboard-manager', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-clipboard-manager/index.ts') },
			{ find: '@tauri-apps/plugin-global-shortcut', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-global-shortcut/index.ts') },
			{ find: '@tauri-apps/plugin-http', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-http/index.ts') },
			{ find: '@tauri-apps/plugin-process', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-process/index.ts') },
			{ find: '@tauri-apps/plugin-updater', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-updater/index.ts') },
			{ find: '@tauri-apps/plugin-notification', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-notification/index.ts') },
			{ find: '@tauri-apps/plugin-deep-link', replacement: resolve(__dirname, 'src/@tauri-apps/plugin-deep-link/index.ts') },
			{ find: 'tauri-plugin-keepawake-api', replacement: resolve(__dirname, 'src/tauri-plugin-keepawake-api/index.ts') },
		],
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
	},
})
