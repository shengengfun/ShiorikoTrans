import { Search, X } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/style'
import { findSection, SECTION_GROUPS, type SectionId, type SettingDef } from '../registry'

interface SettingsSidebarProps {
	/** Width in px; the divider next to it is draggable. */
	width: number
	activeSection: SectionId
	onSelectSection: (id: SectionId) => void
	query: string
	setQuery: (query: string) => void
	results: SettingDef[]
	onOpenResult: (def: SettingDef) => void
	version: string
	onClose: () => void
	searchRef: RefObject<HTMLInputElement | null>
}

/**
 * Left rail: search box + grouped navigation. Filtering switches the rail to a
 * result list (like RinaDown) instead of hiding nav items, so a hit can jump
 * straight to the setting — including into the right sub-tab.
 */
export function SettingsSidebar({
	width,
	activeSection,
	onSelectSection,
	query,
	setQuery,
	results,
	onOpenResult,
	version,
	onClose,
	searchRef,
}: SettingsSidebarProps) {
	const [activeIndex, setActiveIndex] = useState(0)

	useEffect(() => {
		setActiveIndex(0)
	}, [query])

	function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			setActiveIndex((index) => Math.min(index + 1, results.length - 1))
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			setActiveIndex((index) => Math.max(index - 1, 0))
		} else if (event.key === 'Enter') {
			event.preventDefault()
			const target = results[activeIndex]
			if (target) onOpenResult(target)
		} else if (event.key === 'Escape') {
			event.preventDefault()
			event.stopPropagation()
			if (query) setQuery('')
			else onClose()
		}
	}

	return (
		<aside style={{ width }} className="flex shrink-0 flex-col border-e border-border/55 bg-muted/25">
			<div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
				<span className="text-sm font-semibold">{m.settings()}</span>
				<Button variant="ghost" size="iconSm" className="h-7 w-7 rounded-lg" onClick={onClose} aria-label={m.modalClose()}>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="px-3 pb-2">
				<div className="relative">
					<Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						ref={searchRef}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={onKeyDown}
						placeholder={m.searchSettings()}
						aria-label={m.searchSettings()}
						className="h-8 rounded-lg ps-8 pe-7 text-xs"
					/>
					{query && (
						<button
							type="button"
							aria-label={m.clear()}
							onClick={() => setQuery('')}
							className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>

			<nav aria-label={m.settings()} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
				{query ? (
					results.length === 0 ? (
						<p className="px-2.5 py-6 text-center text-xs text-muted-foreground">{m.searchSettingsNoResults()}</p>
					) : (
						<ul className="space-y-1">
							{results.map((def, index) => (
								<li key={def.id}>
									<button
										type="button"
										onMouseEnter={() => setActiveIndex(index)}
										onClick={() => onOpenResult(def)}
										aria-current={index === activeIndex ? 'true' : undefined}
										className={cn(
											'w-full rounded-lg px-2.5 py-1.5 text-left transition-colors',
											index === activeIndex ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50',
										)}>
										<span className="flex items-center gap-1.5">
											<span className="min-w-0 flex-1 truncate text-[13px] font-medium">{def.label()}</span>
											<span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
												{findSection(def.section).label()}
											</span>
										</span>
										{def.description && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{def.description()}</span>}
									</button>
								</li>
							))}
						</ul>
					)
				) : (
					SECTION_GROUPS.map((group) => (
						<div key={group.label()} className="mb-2.5 space-y-0.5 last:mb-0">
							<p className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground/60 uppercase">{group.label()}</p>
							{group.sections.map((section) => {
								const active = activeSection === section.id
								const Icon = section.icon
								return (
									<button
										key={section.id}
										type="button"
										aria-current={active ? 'page' : undefined}
										onClick={() => onSelectSection(section.id)}
										className={cn(
											'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors',
											active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
										)}>
										<Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
										<span className="truncate">{section.label()}</span>
									</button>
								)
							})}
						</div>
					))
				)}
			</nav>

			<div className="flex items-center justify-between gap-2 border-t border-border/55 px-3 py-2">
				<span className="font-mono text-[10px] tracking-wider text-muted-foreground/70 uppercase">{version ? `v${version}` : ''}</span>
				<span className="truncate text-[10px] text-muted-foreground/60">{m.searchSettingsHint()}</span>
			</div>
		</aside>
	)
}
