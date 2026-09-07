// Compatibility shim: @tauri-apps/plugin-os
export { locale } from '~/lib/electron-adapter'

export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'
export type OsType = 'Windows_NT' | 'Darwin' | 'Linux'

export function platform(): Platform {
	const ua = navigator.userAgent
	if (ua.includes('Windows')) return 'windows'
	if (ua.includes('Mac')) return 'macos'
	if (ua.includes('Linux')) return 'linux'
	return 'unknown'
}

export function arch(): string {
	return 'x86_64'
}

export function type(): OsType {
	const p = platform()
	if (p === 'windows') return 'Windows_NT'
	if (p === 'macos') return 'Darwin'
	return 'Linux'
}

export function version(): string {
	return '0.0.0'
}

export function hostname(): string {
	return 'localhost'
}
