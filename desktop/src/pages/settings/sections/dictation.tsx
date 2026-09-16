import { useEffect, useMemo, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { useHotkeyProvider, type HotkeyActivationMode, type HotkeyOutputMode } from '~/providers/hotkey'
import { getDictationIndicatorEnabled, setDictationIndicatorEnabled } from '~/lib/dictation-indicator'
import { cn } from '~/lib/style'
import { SettingRow, SettingsGroup } from '../components/kit'

/** Segmented button group used for the activation / output mode choices. */
function SegmentedChoice<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T
	options: { value: T; label: () => string }[]
	onChange: (value: T) => void
}) {
	return (
		<div className="flex h-9 min-w-56 items-center gap-1 rounded-lg border border-border/55 bg-muted/40 p-1">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={cn(
						'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						value === option.value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
					)}>
					{option.label()}
				</button>
			))}
		</div>
	)
}

export function DictationSection() {
	const hotkey = useHotkeyProvider()
	const [indicatorEnabled, setIndicatorEnabled] = useState(true)

	useEffect(() => {
		getDictationIndicatorEnabled().then(setIndicatorEnabled).catch(console.error)
	}, [])

	async function changeIndicatorEnabled(enabled: boolean) {
		setIndicatorEnabled(enabled)
		try {
			await setDictationIndicatorEnabled(enabled)
		} catch (error) {
			setIndicatorEnabled(!enabled)
			console.error(error)
		}
	}

	const isMac = navigator.platform.toUpperCase().includes('MAC')
	const activationDescriptions = {
		'push-to-talk': m.hotkeyActivationPushToTalkDescription,
		toggle: m.hotkeyActivationToggleDescription,
	} as const

	const shortcutKeys = useMemo(() => {
		const keyMap: Record<string, string> = {
			CmdOrCtrl: isMac ? '⌘' : 'Ctrl',
			Cmd: '⌘',
			Ctrl: isMac ? '⌃' : 'Ctrl',
			Shift: isMac ? '⇧' : 'Shift',
			Alt: isMac ? '⌥' : 'Alt',
			Option: '⌥',
		}
		return hotkey.hotkeyShortcut.split('+').map((key) => keyMap[key] ?? key)
	}, [hotkey.hotkeyShortcut, isMac])

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.globalDictation()} description={m.globalDictationPromo()}>
				<SettingRow id="hotkeyEnabled" hideDescription control={<Switch checked={hotkey.hotkeyEnabled} onCheckedChange={hotkey.setHotkeyEnabled} />} />

				{hotkey.hotkeyEnabled && (
					<>
						<SettingRow
							id="dictationIndicator"
							control={<Switch checked={indicatorEnabled} onCheckedChange={changeIndicatorEnabled} />}
						/>
						<SettingRow
							id="hotkeyActivationMode"
							vertical
							hideDescription
							control={
								<div className="space-y-1.5">
									<SegmentedChoice<HotkeyActivationMode>
										value={hotkey.hotkeyActivationMode}
										onChange={hotkey.setHotkeyActivationMode}
										options={[
											{ value: 'push-to-talk', label: () => m.hotkeyActivationPushToTalk() },
											{ value: 'toggle', label: () => m.hotkeyActivationToggle() },
										]}
									/>
									<p className="text-xs text-muted-foreground">{activationDescriptions[hotkey.hotkeyActivationMode]()}</p>
								</div>
							}
						/>
						<SettingRow
							id="hotkeyShortcut"
							hideDescription
							label={
								<span className="flex flex-wrap items-center gap-2">
									{m.globalHotkeyShortcut()}
									<span className="flex items-center gap-1">
										{shortcutKeys.map((key, index) => (
											<kbd
												key={index}
												className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border/80 bg-background/70 px-1.5 font-mono text-[11px] font-medium text-foreground/80 shadow-[0_1px_0_1px_rgba(0,0,0,0.04)]">
												{key}
											</kbd>
										))}
									</span>
								</span>
							}
							control={<Input type="text" className="h-9 w-56 font-mono" value={hotkey.hotkeyShortcut} onChange={(event) => hotkey.setHotkeyShortcut(event.target.value)} />}
						/>
						<SettingRow
							id="hotkeyOutputMode"
							vertical
							hideDescription
							control={
								<SegmentedChoice<HotkeyOutputMode>
									value={hotkey.hotkeyOutputMode}
									onChange={hotkey.setHotkeyOutputMode}
									options={[
										{ value: 'clipboard', label: () => m.hotkeyOutputClipboard() },
										{ value: 'type', label: () => m.hotkeyOutputType() },
									]}
								/>
							}
						/>
						<SettingRow
							id="hotkeyNormalizeOutput"
							control={<Switch checked={hotkey.hotkeyNormalizeOutput} onCheckedChange={hotkey.setHotkeyNormalizeOutput} />}
						/>
					</>
				)}
			</SettingsGroup>
		</div>
	)
}
