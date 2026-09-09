/**
 * Appearance helpers: theme color presets + custom hex support + background.
 *
 * The app's theme colors are plain CSS custom properties (--primary, --ring,
 * --sidebar-primary, --sidebar-ring, --chart-1 ...) defined on `:root` / `.dark`
 * in globals.css. Users can pick a preset palette or type a custom hex value;
 * we then override those variables at runtime so every `bg-primary` /
 * `text-primary` style updates instantly.
 */

export interface AccentPreset {
	id: string
	/** Display name (locale-agnostic for now). */
	name: string
	/** main accent color shown on the swatch. */
	color: string
	/** hue / sat% / light% used for the LIGHT scheme. */
	light: { h: number; s: number; l: number }
	/** hue / sat% / light% used for the DARK scheme. */
	dark: { h: number; s: number; l: number }
}

export const ACCENT_PRESETS: AccentPreset[] = [
	{ id: 'shioriko', name: 'Shioriko', color: '#37b484', light: { h: 157, s: 55, l: 45 }, dark: { h: 158, s: 68, l: 56 } },
	{ id: 'blue', name: 'Blue', color: '#1677d3', light: { h: 205, s: 74, l: 43 }, dark: { h: 212, s: 100, l: 56 } },
	{ id: 'sky', name: 'Sky', color: '#0284c7', light: { h: 199, s: 89, l: 39 }, dark: { h: 199, s: 95, l: 60 } },
	{ id: 'teal', name: 'Teal', color: '#0d9488', light: { h: 173, s: 80, l: 32 }, dark: { h: 172, s: 70, l: 52 } },
	{ id: 'emerald', name: 'Emerald', color: '#059669', light: { h: 161, s: 94, l: 30 }, dark: { h: 158, s: 64, l: 52 } },
	{ id: 'violet', name: 'Violet', color: '#7c3aed', light: { h: 262, s: 83, l: 58 }, dark: { h: 258, s: 90, l: 66 } },
	{ id: 'rose', name: 'Rose', color: '#e11d48', light: { h: 348, s: 77, l: 48 }, dark: { h: 348, s: 90, l: 60 } },
	{ id: 'amber', name: 'Amber', color: '#d97706', light: { h: 32, s: 95, l: 44 }, dark: { h: 38, s: 92, l: 55 } },
	{ id: 'fuchsia', name: 'Fuchsia', color: '#c026d3', light: { h: 292, s: 84, l: 49 }, dark: { h: 293, s: 80, l: 64 } },
]

export const DEFAULT_ACCENT_ID = 'shioriko'

/** hex (#rrggbb or #rgb) -> {h,s,l} in 0..360 / 0..100 / 0..100 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
	let value = hex.trim().replace(/^#/, '')
	if (value.length === 3) value = value.split('').map((c) => c + c).join('')
	if (!/^[0-9a-fA-F]{6}$/.test(value)) return null
	const num = parseInt(value, 16)
	const r = ((num >> 16) & 255) / 255
	const g = ((num >> 8) & 255) / 255
	const b = (num & 255) / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	let h = 0
	let s = 0
	if (max !== min) {
		const d = max - min
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break
			case g: h = (b - r) / d + 2; break
			default: h = (r - g) / d + 4
		}
		h *= 60
	}
	return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslCss({ h, s, l }: { h: number; s: number; l: number }): string {
	return `hsl(${h} ${s}% ${l}%)`
}

/**
 * Variables that carry the "primary" hue across the UI. Overriding these keeps
 * buttons, accents, rings, charts and sidebar in sync with the chosen color.
 */
const ACCENT_VARS = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring', '--chart-1'] as const

export type ThemeScheme = 'light' | 'dark'

export interface ResolvedAccent {
	light: { h: number; s: number; l: number }
	dark: { h: number; s: number; l: number }
}

/** Resolve a user's accent choice (custom hex wins over preset id). */
export function resolveAccent(presetId: string, customHex: string | null): ResolvedAccent | null {
	if (customHex) {
		const hsl = hexToHsl(customHex)
		if (hsl) {
			return {
				light: { ...hsl },
				// Dark scheme: brighten the accent a bit so it pops on dark surfaces.
				dark: { h: hsl.h, s: Math.min(100, hsl.s + 12), l: Math.min(68, hsl.l + 20) },
			}
		}
	}
	const preset = ACCENT_PRESETS.find((p) => p.id === presetId)
	if (preset) return { light: preset.light, dark: preset.dark }
	return null
}

/** Applies (or clears) the accent color on <html> using inline styles. */
export function applyAccentColor(presetId: string, customHex: string | null, scheme: ThemeScheme) {
	const el = document.documentElement
	if (presetId === DEFAULT_ACCENT_ID && !customHex) {
		for (const v of ACCENT_VARS) el.style.removeProperty(v)
		return
	}
	const resolved = resolveAccent(presetId, customHex)
	if (!resolved) {
		for (const v of ACCENT_VARS) el.style.removeProperty(v)
		return
	}
	const hsl = scheme === 'dark' ? resolved.dark : resolved.light
	const css = hslCss(hsl)
	for (const v of ACCENT_VARS) el.style.setProperty(v, css)
}

/** Blur a small overlay on top of body for readability behind custom background. */
export function backgroundOverlay(scheme: ThemeScheme, strength: number): string {
	const alpha = Math.min(1, Math.max(0, strength))
	if (scheme === 'dark') {
		return `linear-gradient(rgb(8 8 10 / ${0.55 * alpha}), rgb(8 8 10 / ${0.55 * alpha}))`
	}
	return `linear-gradient(rgb(255 255 255 / ${0.55 * alpha}), rgb(255 255 255 / ${0.55 * alpha}))`
}
