import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { InfoTooltip } from '~/components/info-tooltip'
import { cn } from '~/lib/style'
import { SETTINGS, type SettingDef, type SettingId } from '../registry'

/**
 * Small settings UI kit shared by every section.
 *
 * Visual language borrowed from RinaDown / LanzhuToolNX: one container per
 * semantic group, dense rows separated by hairlines, label + description on the
 * left and the control on the right. Compared to the previous one-card-per-
 * setting layout this roughly doubles the number of visible options per screen.
 */

interface SettingsUiValue {
	/** Rows register their DOM node so a search hit can scroll/flash it. */
	registerNode: (id: string, node: HTMLElement | null) => void
	/** Id of the row that should currently flash (search jump target). */
	flashId: string | null
}

const SettingsUiContext = createContext<SettingsUiValue>({ registerNode: () => {}, flashId: null })

export function SettingsUiProvider({ value, children }: { value: SettingsUiValue; children: ReactNode }) {
	return <SettingsUiContext.Provider value={value}>{children}</SettingsUiContext.Provider>
}

export function useSettingsUi() {
	return useContext(SettingsUiContext)
}

/** Registers a DOM node under a setting id and reports the flash state. */
function useHighlightTarget(id: string) {
	const { registerNode, flashId } = useSettingsUi()
	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		registerNode(id, ref.current)
		return () => registerNode(id, null)
	}, [id, registerNode])

	return { ref, flashing: flashId === id }
}

const FLASH_CLASS = 'bg-primary/[0.07] ring-1 ring-inset ring-primary/30'

/** Group container: optional section title + hairline-separated rows. */
export function SettingsGroup({
	title,
	description,
	children,
	className,
}: {
	title?: ReactNode
	description?: ReactNode
	children: ReactNode
	className?: string
}) {
	return (
		<section className={cn('space-y-2', className)}>
			{title != null && (
				<div className="px-1">
					<h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
					{description != null && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground/85">{description}</p>}
				</div>
			)}
			<div className="divide-y divide-border/45 overflow-hidden rounded-2xl border border-border/60 bg-card/92 shadow-xs">{children}</div>
		</section>
	)
}

interface SettingRowProps {
	/** Registry id — supplies the label/description and the search target. */
	id: SettingId
	/** Override the registry label (e.g. plural variants). */
	label?: ReactNode
	/** Override the registry description. */
	description?: ReactNode
	/** Hide the description even when the registry has one. */
	hideDescription?: boolean
	/** Control rendered on the trailing edge (horizontal) or below (vertical). */
	control?: ReactNode
	/** Stack the control under the text — for wide inputs, sliders and lists. */
	vertical?: boolean
	/** Tooltip shown next to the label instead of the inline description. */
	info?: string
	className?: string
	/** Extra content rendered under the row body. */
	children?: ReactNode
}

function useSettingText(id: SettingId, label?: ReactNode, description?: ReactNode, hideDescription?: boolean) {	return useMemo(() => {
		const def = SETTINGS[id] as SettingDef
		return {
			label: label ?? def.label(),
			description: hideDescription ? null : (description ?? def.description?.() ?? null),
		}
	}, [id, label, description, hideDescription])
}

/**
 * A single setting: text block on the left, control on the right. The whole row
 * is a search target, so `id` must exist in the registry.
 */
export function SettingRow({ id, label, description, hideDescription, control, vertical, info, className, children }: SettingRowProps) {
	const { ref, flashing } = useHighlightTarget(id)
	const text = useSettingText(id, label, description, hideDescription)

	return (
		<div ref={ref} className={cn('transition-colors duration-300 hover:bg-accent/25', flashing && FLASH_CLASS, className)}>
			<div className={cn('gap-4 px-4 py-3', vertical ? 'flex flex-col' : 'flex items-center justify-between')}>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						{info != null && <InfoTooltip text={info} />}
						<span className="text-sm font-medium">{text.label}</span>
					</div>
					{text.description != null && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{text.description}</p>}
				</div>
				{control != null && <div className={cn('shrink-0', !vertical && 'max-w-[60%]')}>{control}</div>}
			</div>
			{children}
		</div>
	)
}

/**
 * Rich card that is still a search target (model catalog, recent files, logs…).
 * Unlike `SettingRow` the body is fully custom.
 */
export function SettingPanel({ id, children, className }: { id: SettingId; children: ReactNode; className?: string }) {
	const { ref, flashing } = useHighlightTarget(id)
	return (
		<div ref={ref} className={cn('space-y-3 px-4 py-3.5 transition-colors duration-300', flashing && FLASH_CLASS, className)}>
			{children}
		</div>
	)
}
/**
 * Plain search target without row chrome — for rows that render their own
 * label (e.g. the shared `LanguageInput`).
 */
export function SettingBlock({ id, children, className }: { id: SettingId; children: ReactNode; className?: string }) {
	const { ref, flashing } = useHighlightTarget(id)
	return (
		<div ref={ref} className={cn('px-4 py-3 transition-colors duration-300', flashing && FLASH_CLASS, className)}>
			{children}
		</div>
	)
}

/**
 * Two-column layout for wide windows: groups are distributed greedily so the
 * reading order stays intact (left column first) while the vertical scroll
 * roughly halves. Below the threshold everything stacks.
 */
export function AdaptiveSections({ children }: { children: ReactNode }) {
	const items = useMemo(() => (Array.isArray(children) ? children.filter(Boolean) : [children]), [children])
	const [twoColumns, setTwoColumns] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	const THRESHOLD = 820

	const measure = useCallback(() => {
		const width = ref.current?.clientWidth ?? 0
		setTwoColumns(width >= THRESHOLD && items.length > 1)
	}, [items.length])

	useEffect(() => {
		measure()
		const observer = new ResizeObserver(measure)
		if (ref.current) observer.observe(ref.current)
		return () => observer.disconnect()
	}, [measure])

	return (
		<div ref={ref} className="w-full">
			{twoColumns ? (
				<div className="grid grid-cols-2 items-start gap-x-5 gap-y-5">
					<div className="space-y-5">{items.filter((_, index) => index % 2 === 0)}</div>
					<div className="space-y-5">{items.filter((_, index) => index % 2 === 1)}</div>
				</div>
			) : (
				<div className="space-y-5">{items}</div>
			)}
		</div>
	)
}

/** Inline key/value chip `label · value` used for read-only state. */
export function StateBadge({ tone = 'muted', children }: { tone?: 'muted' | 'primary' | 'warning' | 'danger'; children: ReactNode }) {
	const tones = {
		muted: 'bg-muted text-muted-foreground',
		primary: 'bg-primary/12 text-primary',
		warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
		danger: 'bg-destructive/12 text-destructive',
	} as const
	return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tones[tone])}>{children}</span>
}

/** Full-width action row (open folder, open link, reset…). */
export function ActionRow({
	label,
	description,
	icon,
	onClick,
	tone = 'default',
	disabled,
}: {
	label: ReactNode
	description?: ReactNode
	icon?: ReactNode
	onClick: () => void
	tone?: 'default' | 'destructive'
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors disabled:pointer-events-none disabled:opacity-50',
				tone === 'destructive' ? 'hover:bg-destructive/10' : 'hover:bg-accent/40',
			)}>
			<span className="min-w-0">
				<span className={cn('block text-sm font-medium', tone === 'destructive' && 'text-destructive')}>{label}</span>
				{description != null && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
			</span>
			{icon}
		</button>
	)
}

/** Compact empty-state line used by list panels. */
export function EmptyHint({ children }: { children: ReactNode }) {
	return <p className="py-2 text-xs italic text-muted-foreground">{children}</p>
}
