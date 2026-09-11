import { open } from '@tauri-apps/plugin-dialog'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { ACCENT_PRESETS, THEME_PALETTES, accentHex, hexToHsl, hslToHex } from '~/lib/appearance'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { SectionCard, type SettingsViewModel } from './shared'
import { cn } from '~/lib/style'
import type { ThemeMode } from '~/providers/preference'

const THEME_MODE_OPTIONS: { value: ThemeMode; label: () => string }[] = [
	{ value: 'system', label: () => m.followSystem() },
	{ value: 'light', label: () => m.light() },
	{ value: 'dark', label: () => m.dark() },
]

/** Palette display names (id -> i18n message). */
const PALETTE_LABELS: Record<string, () => string> = {
	default: () => m.themeDefault(),
	midnight: () => m.themeMidnight(),
	nord: () => m.themeNord(),
	warm: () => m.themeWarm(),
	ink: () => m.themeInk(),
}

/** Character colour names (preset label key -> i18n message). */
const COLOR_LABELS: Record<string, () => string> = {
	colorAyumu: () => m.colorAyumu(),
	colorKasumi: () => m.colorKasumi(),
	colorShizuku: () => m.colorShizuku(),
	colorKarin: () => m.colorKarin(),
	colorAi: () => m.colorAi(),
	colorKanata: () => m.colorKanata(),
	colorSetsuna: () => m.colorSetsuna(),
	colorEmma: () => m.colorEmma(),
	colorRina: () => m.colorRina(),
	colorShioriko: () => m.colorShioriko(),
	colorMia: () => m.colorMia(),
	colorLanzhu: () => m.colorLanzhu(),
	colorYu: () => m.colorYu(),
}

const colorLabel = (key: string, fallback: string) => (COLOR_LABELS[key] ?? (() => fallback))()

/** A single colour swatch with a tooltip and a check mark when selected. */
function ColorDot({
	color,
	label,
	selected,
	onClick,
	dashed,
	children,
}: {
	color: string
	label: string
	selected: boolean
	onClick: () => void
	dashed?: boolean
	children?: React.ReactNode
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			className={cn(
				'relative flex h-8 w-8 items-center justify-center rounded-full border transition-transform hover:scale-110',
				selected ? 'border-foreground ring-2 ring-foreground/25' : dashed ? 'border-dashed border-border/70 hover:border-foreground/40' : 'border-black/10 dark:border-white/15',
			)}
			style={{ backgroundColor: color }}>
			{children ?? (selected && <Check className="h-4 w-4" style={{ color: 'hsl(0 0% 100%)' }} />)}
		</button>
	)
}

/** Hue / saturation / lightness sliders + hex field for the custom accent. */
function CustomColorPicker({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
	const [hsl, setHsl] = useState(() => hexToHsl(color) ?? { h: 157, s: 55, l: 45 })
	const [hexText, setHexText] = useState(() => color.replace('#', '').toUpperCase())

	useEffect(() => {
		const next = hexToHsl(color)
		if (next) setHsl(next)
		setHexText(color.replace('#', '').toUpperCase())
	}, [color])

	function commit(h: number, s: number, l: number) {
		const hex = hslToHex({ h, s, l })
		setHsl({ h, s, l })
		setHexText(hex.replace('#', '').toUpperCase())
		onChange(hex)
	}

	function commitHex(value: string) {
		const parsed = hexToHsl(value)
		if (!parsed) {
			setHexText(color.replace('#', '').toUpperCase())
			return
		}
		setHsl(parsed)
		onChange(`#${value.replace('#', '').trim()}`)
	}

	const current = `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`

	return (
		<div className="space-y-3 pt-1">
			<input
				type="range"
				min={0}
				max={360}
				step={1}
				value={hsl.h}
				aria-label={m.hueLabel()}
				onChange={(event) => commit(Number(event.target.value), hsl.s, hsl.l)}
				className="color-slider"
				style={{
					color: current,
					backgroundImage:
						'linear-gradient(to right, hsl(0 90% 55%), hsl(60 90% 55%), hsl(120 90% 45%), hsl(180 90% 45%), hsl(240 90% 60%), hsl(300 90% 60%), hsl(360 90% 55%))',
				}}
			/>
			<input
				type="range"
				min={0}
				max={100}
				step={1}
				value={hsl.s}
				aria-label={m.saturationLabel()}
				onChange={(event) => commit(hsl.h, Number(event.target.value), hsl.l)}
				className="color-slider"
				style={{
					color: current,
					backgroundImage: `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`,
				}}
			/>
			<input
				type="range"
				min={4}
				max={96}
				step={1}
				value={hsl.l}
				aria-label={m.lightnessLabel()}
				onChange={(event) => commit(hsl.h, hsl.s, Number(event.target.value))}
				className="color-slider"
				style={{
					color: current,
					backgroundImage: `linear-gradient(to right, hsl(${hsl.h} ${hsl.s}% 4%), hsl(${hsl.h} ${hsl.s}% 50%), hsl(${hsl.h} ${hsl.s}% 96%))`,
				}}
			/>
			<div className="flex items-center gap-2">
				<span className="h-5 w-5 shrink-0 rounded-full border border-black/10 dark:border-white/15" style={{ backgroundColor: current }} />
				<span className="text-sm text-muted-foreground">#</span>
				<Input
					value={hexText}
					onChange={(event) => setHexText(event.target.value)}
					onBlur={(event) => commitHex(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commitHex((event.target as HTMLInputElement).value)
					}}
					placeholder="37B484"
					className="h-8 w-28 font-mono text-xs uppercase"
				/>
				<span className="text-xs text-muted-foreground">{m.customColorHint()}</span>
			</div>
		</div>
	)
}

export function AppearanceSection({ vm }: { vm: SettingsViewModel }) {
	const prefs = vm.preference
	const custom = prefs.accentCustomColor
	const activePreset = custom ? null : prefs.accentPreset
	const activeHex = accentHex(prefs.accentPreset, custom) ?? '#37b484'

	async function pickBackground() {
		const file = await open({
			multiple: false,
			directory: false,
			filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
		})
		if (typeof file === 'string') prefs.setCustomBackground(file)
	}

	return (
		<div className="space-y-5">
			{/* Theme mode: follow system / light / dark */}
			<SectionCard>
				<div className="space-y-2">
					<Label>{m.theme()}</Label>
					<div className="flex h-9 items-center gap-1 rounded-lg border border-border/55 bg-muted/40 p-1">
						{THEME_MODE_OPTIONS.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => prefs.setThemeMode(option.value)}
								className={cn(
									'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
									prefs.themeMode === option.value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
								)}>
								{option.label()}
							</button>
						))}
					</div>
					{prefs.themeMode === 'system' && (
						<p className="text-xs text-muted-foreground">
							{m.systemThemeNow()} · {prefs.theme === 'dark' ? m.dark() : m.light()}
						</p>
					)}
				</div>
			</SectionCard>

			{/* Neutral palette (surfaces) — available for both light and dark */}
			<SectionCard>
				<div className="space-y-2">
					<Label>{m.themePalette()}</Label>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{THEME_PALETTES.map((palette) => {
							const selected = prefs.themePalette === palette.id
							const background = prefs.theme === 'dark' ? palette.previewDark : palette.previewLight
							// The default palette keeps the values from globals.css, so fall back to them.
							const card =
								(prefs.theme === 'dark' ? palette.dark.card : palette.light.card) ?? (prefs.theme === 'dark' ? 'hsl(220 9% 16%)' : 'hsl(0 0% 100%)')
							const line =
								(prefs.theme === 'dark' ? palette.dark.border : palette.light.border) ?? (prefs.theme === 'dark' ? 'hsl(220 8% 34%)' : 'hsl(208 22% 83%)')
							return (
								<button
									key={palette.id}
									type="button"
									onClick={() => prefs.setThemePalette(palette.id)}
									className={cn(
										'flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
										selected ? 'border-primary bg-primary/8' : 'border-border/60 hover:border-foreground/30 hover:bg-accent/40',
									)}>
									{/* Mini window preview: surface + card + accent dot */}
									<span
										className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-black/5 dark:border-white/10"
										style={{ backgroundColor: background }}>
										<span className="flex h-6 w-10 items-center gap-1 rounded-[5px] border px-1" style={{ backgroundColor: card, borderColor: line }}>
											<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activeHex }} />
											<span className="h-1 flex-1 rounded-full" style={{ backgroundColor: line }} />
										</span>
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">{(PALETTE_LABELS[palette.id] ?? (() => palette.name))()}</span>
										<span className="block text-[11px] text-muted-foreground">
											{prefs.theme === 'dark' ? m.dark() : m.light()}
										</span>
									</span>
									{selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
								</button>
							)
						})}
					</div>
				</div>
			</SectionCard>

			{/* Accent colour — Nijigasaki character colours + custom picker */}
			<SectionCard>
				<div className="space-y-3">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Label>{m.accentColor()}</Label>
						{custom && (
							<Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={() => prefs.setAccentCustomColor(null)}>
								{m.resetCustom()}
							</Button>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{ACCENT_PRESETS.map((preset) => (
							<ColorDot
								key={preset.id}
								color={preset.color}
								label={colorLabel(preset.label, preset.id)}
								selected={activePreset === preset.id}
								onClick={() => {
									prefs.setAccentPreset(preset.id)
									prefs.setAccentCustomColor(null)
								}}
							/>
						))}
						<ColorDot
							color={custom ?? '#37b484'}
							label={m.colorCustom()}
							dashed={!custom}
							selected={Boolean(custom)}
							onClick={() => prefs.setAccentCustomColor(custom ?? activeHex)}>
							{!custom && <span className="text-xs font-bold text-muted-foreground">#</span>}
						</ColorDot>
					</div>
					{custom && <CustomColorPicker color={custom} onChange={prefs.setAccentCustomColor} />}
				</div>
			</SectionCard>

			{/* Custom background image */}
			<SectionCard>
				<div className="space-y-2">
					<Label>{m.customBackground()}</Label>
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="outline" onClick={pickBackground}>
							{m.chooseImage()}
						</Button>
						{prefs.customBackground && (
							<Button variant="ghost" onClick={() => prefs.setCustomBackground(null)}>
								{m.remove()}
							</Button>
						)}
					</div>
					{prefs.customBackground && <p className="truncate font-mono text-xs text-muted-foreground">{prefs.customBackground}</p>}
				</div>
			</SectionCard>

			<SectionCard>
				<p className="text-sm leading-relaxed text-muted-foreground">{m.appearanceInfo()}</p>
			</SectionCard>
		</div>
	)
}
