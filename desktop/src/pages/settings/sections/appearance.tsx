import { open } from '@tauri-apps/plugin-dialog'
import { m } from '~/paraglide/messages.js'
import { ACCENT_PRESETS, THEME_PALETTES } from '~/lib/appearance'
import { Button } from '~/components/ui/button'
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

export function AppearanceSection({ vm }: { vm: SettingsViewModel }) {
	const prefs = vm.preference
	const custom = prefs.accentCustomColor
	const activePreset = custom ? null : prefs.accentPreset
	const presetFallback = ACCENT_PRESETS.find((p) => p.id === prefs.accentPreset)?.color ?? '#1677d3'

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
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{THEME_PALETTES.map((palette) => {
							const selected = prefs.themePalette === palette.id
							const preview = prefs.theme === 'dark' ? palette.previewDark : palette.previewLight
							return (
								<button
									key={palette.id}
									type="button"
									onClick={() => prefs.setThemePalette(palette.id)}
									className={cn(
										'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
										selected ? 'border-primary bg-primary/8' : 'border-border/60 hover:border-foreground/30 hover:bg-accent/40',
									)}>
									<span
										className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60"
										style={{ backgroundColor: preview }}>
										<span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: custom ?? presetFallback }} />
									</span>
									<span className="min-w-0 truncate text-sm font-medium">{(PALETTE_LABELS[palette.id] ?? (() => palette.name))()}</span>
								</button>
							)
						})}
					</div>
				</div>
			</SectionCard>

			{/* Accent color — layered on top of the palette, in both schemes */}
			<SectionCard>
				<div className="space-y-2">
					<Label>{m.accentColor()}</Label>
					<div className="flex flex-wrap items-center gap-2.5">
						{ACCENT_PRESETS.map((preset) => {
							const selected = activePreset === preset.id
							return (
								<button
									key={preset.id}
									type="button"
									title={preset.name}
									aria-label={preset.name}
									onClick={() => {
										prefs.setAccentPreset(preset.id)
										prefs.setAccentCustomColor(null)
									}}
									className={cn(
										'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
										selected ? 'border-foreground ring-2 ring-foreground/20' : 'border-border/60 hover:border-foreground/40',
									)}
									style={{ backgroundColor: preset.color }}
								/>
							)
						})}
						<label
							title={m.accentColor()}
							className={cn(
								'relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-transform hover:scale-110',
								custom ? 'border-foreground ring-2 ring-foreground/20' : 'border-dashed border-border/60 hover:border-foreground/40',
							)}>
							<input
								type="color"
								className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
								value={custom ?? presetFallback}
								onChange={(event) => prefs.setAccentCustomColor(event.target.value)}
							/>
							<span className="text-xs font-bold text-muted-foreground">#</span>
						</label>
						{custom && (
							<Button variant="ghost" size="sm" onClick={() => prefs.setAccentCustomColor(null)}>
								{m.resetCustom()}
							</Button>
						)}
					</div>
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
