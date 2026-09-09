import { open } from '@tauri-apps/plugin-dialog'
import { m } from '~/paraglide/messages.js'
import { ACCENT_PRESETS } from '~/lib/appearance'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Field, SectionCard, type SettingsViewModel } from './shared'
import { cn } from '~/lib/style'

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
			<SectionCard>
				<Field label={m.theme()}>
					<Select value={prefs.theme} onValueChange={(value) => prefs.setTheme(value as 'light' | 'dark')}>
						<SelectTrigger className="capitalize"><SelectValue placeholder={m.selectTheme()} /></SelectTrigger>
						<SelectContent>
							<SelectItem value="light">{m.light()}</SelectItem>
							<SelectItem value="dark">{m.dark()}</SelectItem>
						</SelectContent>
					</Select>
				</Field>
			</SectionCard>

			<SectionCard>
				<Field label="Accent color">
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
							title="Custom color"
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
								Reset custom
							</Button>
						)}
					</div>
				</Field>
			</SectionCard>

			<SectionCard>
				<Field label="Custom background">
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="outline" onClick={pickBackground}>
							Choose image…
						</Button>
						{prefs.customBackground && (
							<Button variant="ghost" onClick={() => prefs.setCustomBackground(null)}>
								Remove
							</Button>
						)}
					</div>
					{prefs.customBackground && (
						<p className="mt-2 truncate font-mono text-xs text-muted-foreground">{prefs.customBackground}</p>
					)}
				</Field>
			</SectionCard>

			<SectionCard>
				<div className="space-y-2">
					<Label>说明</Label>
					<p className="text-sm leading-relaxed text-muted-foreground">
						主题色可选用预设色板或点击 “#” 输入任意 HTML 色号（立即生效）。自定义背景图片会在卡片背后显示，自动叠加半透明遮罩以保证可读性。
					</p>
				</div>
			</SectionCard>
		</div>
	)
}
