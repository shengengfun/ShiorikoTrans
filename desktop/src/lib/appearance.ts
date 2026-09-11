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
	/** i18n key suffix (`color<Name>`) used for the swatch tooltip. */
	label: string
	/** 虹咲学园角色应援色 (Nijigasaki character colour). */
	color: string
}

/**
 * Built-in accent colours — the Nijigasaki character colours, mirroring the
 * palette used by RinaDown. The light/dark variants are derived from the hex
 * value (see `resolveAccent`) so adding a colour is a one-liner.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
	{ id: 'ayumu', label: 'colorAyumu', color: '#ed7d95' },
	{ id: 'kasumi', label: 'colorKasumi', color: '#e7d600' },
	{ id: 'shizuku', label: 'colorShizuku', color: '#01b7ed' },
	{ id: 'karin', label: 'colorKarin', color: '#485ec6' },
	{ id: 'ai', label: 'colorAi', color: '#ff5800' },
	{ id: 'kanata', label: 'colorKanata', color: '#a664a0' },
	{ id: 'setsuna', label: 'colorSetsuna', color: '#d81c2f' },
	{ id: 'emma', label: 'colorEmma', color: '#84c36e' },
	{ id: 'rina', label: 'colorRina', color: '#9ca5b9' },
	{ id: 'shioriko', label: 'colorShioriko', color: '#37b484' },
	{ id: 'mia', label: 'colorMia', color: '#a9a898' },
	{ id: 'lanzhu', label: 'colorLanzhu', color: '#f69992' },
	{ id: 'yu', label: 'colorYu', color: '#1d1d1d' },
]

/** Default accent: 三船栞子 (Mifune Shioriko). */
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

/** HSL (h 0..360, s/l 0..100) -> `#rrggbb`. */
export function hslToHex({ h, s, l }: { h: number; s: number; l: number }): string {
	const sat = Math.min(100, Math.max(0, s)) / 100
	const light = Math.min(100, Math.max(0, l)) / 100
	const hue = ((h % 360) + 360) % 360
	const c = (1 - Math.abs(2 * light - 1)) * sat
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
	const m = light - c / 2
	const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
	const toHex = (value: number) =>
		Math.round((value + m) * 255)
			.toString(16)
			.padStart(2, '0')
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Relative luminance (0..1) of a hex colour — used to pick a readable foreground. */
export function relativeLuminance(hex: string): number {
	const hsl = hexToHsl(hex)
	if (!hsl) return 0.5
	const { r, g, b } = hslToRgb(hsl)
	const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }) {
	const sat = Math.min(100, Math.max(0, s)) / 100
	const light = Math.min(100, Math.max(0, l)) / 100
	const hue = ((h % 360) + 360) % 360
	const c = (1 - Math.abs(2 * light - 1)) * sat
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
	const m = light - c / 2
	const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
	return { r: r + m, g: g + m, b: b + m }
}

/** Foreground colour for text/icons drawn on top of `hex`. */
export function onAccentColor(hex: string): string {
	return relativeLuminance(hex) > 0.55 ? 'hsl(224 24% 12%)' : 'hsl(0 0% 100%)'
}

/**
 * Variables that carry the "primary" hue across the UI. Overriding these keeps
 * buttons, accents, rings, charts and sidebar in sync with the chosen color.
 */
const ACCENT_VARS = ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring', '--chart-1'] as const
/** Foreground colours that must stay readable on top of the accent. */
const ACCENT_FOREGROUND_VARS = ['--primary-foreground', '--sidebar-primary-foreground'] as const

export type ThemeScheme = 'light' | 'dark'

/**
 * Full neutral palette for one scheme. Only the "surface" variables are listed —
 * accent variables stay untouched so the accent color can be layered on top of
 * any palette (that's what makes dark mode work with every accent preset).
 */
export interface PaletteTokens {
	background: string
	foreground: string
	card: string
	cardForeground: string
	popover: string
	popoverForeground: string
	secondary: string
	secondaryForeground: string
	muted: string
	mutedForeground: string
	accent: string
	accentForeground: string
	border: string
	input: string
	sidebar: string
}

export interface ThemePalette {
	id: string
	name: string
	/** Swatch shown on the palette card (light bg, dark bg). */
	previewLight: string
	previewDark: string
	light: PaletteTokens
	dark: PaletteTokens
}

/** Palette ids that map 1:1 onto the CSS custom properties in globals.css. */
const PALETTE_VARS: Record<keyof PaletteTokens, string> = {
	background: '--background',
	foreground: '--foreground',
	card: '--card',
	cardForeground: '--card-foreground',
	popover: '--popover',
	popoverForeground: '--popover-foreground',
	secondary: '--secondary',
	secondaryForeground: '--secondary-foreground',
	muted: '--muted',
	mutedForeground: '--muted-foreground',
	accent: '--accent',
	accentForeground: '--accent-foreground',
	border: '--border',
	input: '--input',
	sidebar: '--sidebar',
}

/** Card/popover/sidebar keep an alpha channel so a custom background image shows through. */
const soft = (hsl: string, alpha: number) => `${hsl} / ${alpha}`

export const THEME_PALETTES: ThemePalette[] = [
	{
		id: 'default',
		name: 'Default',
		previewLight: 'hsl(210 34% 96%)',
		previewDark: 'hsl(220 10% 10%)',
		light: {} as PaletteTokens,
		dark: {} as PaletteTokens,
	},
	{
		id: 'midnight',
		name: 'Midnight',
		previewLight: 'hsl(210 40% 97%)',
		previewDark: 'hsl(222 47% 8%)',
		light: {
			background: 'hsl(210 40% 97%)',
			foreground: 'hsl(222 47% 16%)',
			card: soft('hsl(0 0% 100%)', 0.95),
			cardForeground: 'hsl(222 47% 16%)',
			popover: soft('hsl(0 0% 100%)', 0.98),
			popoverForeground: 'hsl(222 47% 16%)',
			secondary: 'hsl(214 32% 93%)',
			secondaryForeground: 'hsl(222 30% 24%)',
			muted: 'hsl(214 32% 93%)',
			mutedForeground: 'hsl(215 18% 44%)',
			accent: 'hsl(214 40% 90%)',
			accentForeground: 'hsl(222 30% 24%)',
			border: 'hsl(214 25% 84%)',
			input: 'hsl(214 25% 84%)',
			sidebar: soft('hsl(0 0% 100%)', 0.9),
		},
		dark: {
			background: 'hsl(222 47% 8%)',
			foreground: 'hsl(210 40% 96%)',
			card: soft('hsl(222 40% 12%)', 0.95),
			cardForeground: 'hsl(210 40% 96%)',
			popover: soft('hsl(222 40% 13%)', 0.98),
			popoverForeground: 'hsl(210 40% 96%)',
			secondary: 'hsl(222 30% 18%)',
			secondaryForeground: 'hsl(210 30% 92%)',
			muted: 'hsl(222 30% 17%)',
			mutedForeground: 'hsl(215 20% 72%)',
			accent: 'hsl(222 30% 22%)',
			accentForeground: 'hsl(210 30% 92%)',
			border: 'hsl(222 25% 26%)',
			input: 'hsl(222 25% 26%)',
			sidebar: soft('hsl(222 40% 11%)', 0.9),
		},
	},
	{
		id: 'nord',
		name: 'Nord',
		previewLight: 'hsl(218 27% 94%)',
		previewDark: 'hsl(220 16% 22%)',
		light: {
			background: 'hsl(218 27% 94%)',
			foreground: 'hsl(220 16% 24%)',
			card: soft('hsl(0 0% 100%)', 0.95),
			cardForeground: 'hsl(220 16% 24%)',
			popover: soft('hsl(0 0% 100%)', 0.98),
			popoverForeground: 'hsl(220 16% 24%)',
			secondary: 'hsl(219 22% 91%)',
			secondaryForeground: 'hsl(220 16% 26%)',
			muted: 'hsl(219 22% 91%)',
			mutedForeground: 'hsl(220 12% 45%)',
			accent: 'hsl(219 28% 88%)',
			accentForeground: 'hsl(220 16% 26%)',
			border: 'hsl(219 20% 82%)',
			input: 'hsl(219 20% 82%)',
			sidebar: soft('hsl(0 0% 100%)', 0.9),
		},
		dark: {
			background: 'hsl(220 16% 22%)',
			foreground: 'hsl(218 27% 92%)',
			card: soft('hsl(222 16% 26%)', 0.95),
			cardForeground: 'hsl(218 27% 92%)',
			popover: soft('hsl(222 16% 27%)', 0.98),
			popoverForeground: 'hsl(218 27% 92%)',
			secondary: 'hsl(222 14% 30%)',
			secondaryForeground: 'hsl(218 27% 92%)',
			muted: 'hsl(222 14% 29%)',
			mutedForeground: 'hsl(219 15% 76%)',
			accent: 'hsl(222 14% 33%)',
			accentForeground: 'hsl(218 27% 92%)',
			border: 'hsl(220 14% 38%)',
			input: 'hsl(220 14% 38%)',
			sidebar: soft('hsl(222 16% 25%)', 0.9),
		},
	},
	{
		id: 'warm',
		name: 'Warm',
		previewLight: 'hsl(38 60% 97%)',
		previewDark: 'hsl(24 14% 9%)',
		light: {
			background: 'hsl(38 60% 97%)',
			foreground: 'hsl(24 20% 18%)',
			card: soft('hsl(40 60% 99%)', 0.95),
			cardForeground: 'hsl(24 20% 18%)',
			popover: soft('hsl(40 60% 99%)', 0.98),
			popoverForeground: 'hsl(24 20% 18%)',
			secondary: 'hsl(36 40% 93%)',
			secondaryForeground: 'hsl(24 20% 22%)',
			muted: 'hsl(36 40% 93%)',
			mutedForeground: 'hsl(28 15% 42%)',
			accent: 'hsl(34 50% 90%)',
			accentForeground: 'hsl(24 20% 22%)',
			border: 'hsl(34 30% 84%)',
			input: 'hsl(34 30% 84%)',
			sidebar: soft('hsl(40 60% 99%)', 0.9),
		},
		dark: {
			background: 'hsl(24 14% 9%)',
			foreground: 'hsl(34 30% 93%)',
			card: soft('hsl(24 12% 13%)', 0.95),
			cardForeground: 'hsl(34 30% 93%)',
			popover: soft('hsl(24 12% 14%)', 0.98),
			popoverForeground: 'hsl(34 30% 93%)',
			secondary: 'hsl(24 10% 18%)',
			secondaryForeground: 'hsl(34 22% 90%)',
			muted: 'hsl(24 10% 17%)',
			mutedForeground: 'hsl(30 14% 72%)',
			accent: 'hsl(24 10% 22%)',
			accentForeground: 'hsl(34 22% 90%)',
			border: 'hsl(24 9% 27%)',
			input: 'hsl(24 9% 27%)',
			sidebar: soft('hsl(24 12% 12%)', 0.9),
		},
	},
	{
		id: 'ink',
		name: 'Ink',
		previewLight: 'hsl(0 0% 97%)',
		previewDark: 'hsl(0 0% 4%)',
		light: {
			background: 'hsl(0 0% 97%)',
			foreground: 'hsl(0 0% 12%)',
			card: soft('hsl(0 0% 100%)', 0.95),
			cardForeground: 'hsl(0 0% 12%)',
			popover: soft('hsl(0 0% 100%)', 0.98),
			popoverForeground: 'hsl(0 0% 12%)',
			secondary: 'hsl(0 0% 94%)',
			secondaryForeground: 'hsl(0 0% 18%)',
			muted: 'hsl(0 0% 94%)',
			mutedForeground: 'hsl(0 0% 42%)',
			accent: 'hsl(0 0% 91%)',
			accentForeground: 'hsl(0 0% 18%)',
			border: 'hsl(0 0% 86%)',
			input: 'hsl(0 0% 86%)',
			sidebar: soft('hsl(0 0% 100%)', 0.9),
		},
		dark: {
			background: 'hsl(0 0% 4%)',
			foreground: 'hsl(0 0% 94%)',
			card: soft('hsl(0 0% 9%)', 0.95),
			cardForeground: 'hsl(0 0% 94%)',
			popover: soft('hsl(0 0% 10%)', 0.98),
			popoverForeground: 'hsl(0 0% 94%)',
			secondary: 'hsl(0 0% 14%)',
			secondaryForeground: 'hsl(0 0% 92%)',
			muted: 'hsl(0 0% 13%)',
			mutedForeground: 'hsl(0 0% 70%)',
			accent: 'hsl(0 0% 18%)',
			accentForeground: 'hsl(0 0% 92%)',
			border: 'hsl(0 0% 22%)',
			input: 'hsl(0 0% 22%)',
			sidebar: soft('hsl(0 0% 7%)', 0.9),
		},
	},
]

export const DEFAULT_PALETTE_ID = 'default'

/** Applies (or clears, for the default palette) a neutral palette on <html>. */
export function applyThemePalette(paletteId: string, scheme: ThemeScheme) {
	const el = document.documentElement
	const palette = THEME_PALETTES.find((item) => item.id === paletteId)
	if (!palette || palette.id === DEFAULT_PALETTE_ID) {
		for (const cssVar of Object.values(PALETTE_VARS)) el.style.removeProperty(cssVar)
		return
	}
	const tokens = scheme === 'dark' ? palette.dark : palette.light
	for (const [key, cssVar] of Object.entries(PALETTE_VARS)) {
		const value = tokens[key as keyof PaletteTokens]
		if (value) el.style.setProperty(cssVar, value)
	}
}

export interface ResolvedAccent {
	light: { h: number; s: number; l: number }
	dark: { h: number; s: number; l: number }
	/** The colour as authored, used for previews. */
	base: string
}

/** The accent hex the user picked (custom hex wins over preset id). */
export function accentHex(presetId: string, customHex: string | null): string | null {
	if (customHex) return customHex
	return ACCENT_PRESETS.find((preset) => preset.id === presetId)?.color ?? null
}

/** Resolve a user's accent choice into light/dark HSL variants. */
export function resolveAccent(presetId: string, customHex: string | null): ResolvedAccent | null {
	const base = accentHex(presetId, customHex)
	if (!base) return null
	const hsl = hexToHsl(base)
	if (!hsl) return null
	return {
		base,
		// Light scheme: keep the accent dark enough to stay readable on white.
		light: { h: hsl.h, s: hsl.s, l: Math.min(hsl.l, 46) },
		// Dark scheme: brighten it so it pops on dark surfaces.
		dark: { h: hsl.h, s: Math.min(100, hsl.s + 10), l: Math.max(52, Math.min(72, hsl.l + 18)) },
	}
}

/** Applies (or clears) the accent color on <html> using inline styles. */
export function applyAccentColor(presetId: string, customHex: string | null, scheme: ThemeScheme) {
	const el = document.documentElement
	const clear = () => {
		for (const cssVar of [...ACCENT_VARS, ...ACCENT_FOREGROUND_VARS]) el.style.removeProperty(cssVar)
	}
	// The default (三船栞子) keeps the hand-tuned values from globals.css.
	if (presetId === DEFAULT_ACCENT_ID && !customHex) {
		clear()
		return
	}
	const resolved = resolveAccent(presetId, customHex)
	if (!resolved) {
		clear()
		return
	}
	const hsl = scheme === 'dark' ? resolved.dark : resolved.light
	const css = hslCss(hsl)
	for (const cssVar of ACCENT_VARS) el.style.setProperty(cssVar, css)
	// Light accents (yellow, cream, …) need dark text on top of them.
	const onAccent = onAccentColor(hslToHex(hsl))
	for (const cssVar of ACCENT_FOREGROUND_VARS) el.style.setProperty(cssVar, onAccent)
}

/** Blur a small overlay on top of body for readability behind custom background. */
export function backgroundOverlay(scheme: ThemeScheme, strength: number): string {
	const alpha = Math.min(1, Math.max(0, strength))
	if (scheme === 'dark') {
		return `linear-gradient(rgb(8 8 10 / ${0.55 * alpha}), rgb(8 8 10 / ${0.55 * alpha}))`
	}
	return `linear-gradient(rgb(255 255 255 / ${0.55 * alpha}), rgb(255 255 255 / ${0.55 * alpha}))`
}
