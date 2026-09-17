import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getLocale } from '~/paraglide/runtime.js'
import { m } from '~/paraglide/messages.js'
import { ModifyState } from '~/lib/types'
import { cn } from '~/lib/style'
import { viewModel } from './view-model'
import { SettingsUiProvider } from './components/kit'
import { SettingsSidebar } from './components/sidebar'
import { defaultTab, findSection, matchSettings, SECTIONS, type SectionId, type SettingDef } from './registry'
import { AboutSection } from './sections/about'
import { AdvancedSection } from './sections/advanced'
import { ApiSection } from './sections/api'
import { AppearanceSection } from './sections/appearance'
import { DictationSection } from './sections/dictation'
import { GeneralSection } from './sections/general'
import { GpuSection } from './sections/gpu'
import { SummarizeSection } from './sections/summarize'
import { TranscriptionSection } from './sections/transcription'
import { TranslationSection } from './sections/translation'

interface SettingsPageProps {
	setVisible: ModifyState<boolean>
	scrollTo?: string
}

/** How long a search jump keeps the target row highlighted. */
const FLASH_MS = 2200

export default function SettingsPage({ setVisible, scrollTo }: SettingsPageProps) {
	const vm = viewModel()
	const locale = getLocale()
	const [query, setQuery] = useState('')
	const [activeSection, setActiveSection] = useState<SectionId>(() =>
		SECTIONS.some((section) => section.id === scrollTo) ? (scrollTo as SectionId) : 'general',
	)
	const [tabBySection, setTabBySection] = useState<Record<string, string>>({})
	const [flashId, setFlashId] = useState<string | null>(null)
	// Dragging the divider is a session-level preference: wide enough for long
	// labels, narrow enough to give the content room (RinaDown's sidebar handle).
	const [sidebarWidth, setSidebarWidth] = useState(240)
	const nodes = useRef(new Map<string, HTMLElement>())
	const searchRef = useRef<HTMLInputElement>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const flashTimer = useRef<number | null>(null)

	const section = findSection(activeSection)
	const tabs = section.tabs
	const activeTab = tabs.length > 0 ? (tabBySection[activeSection] ?? defaultTab(section)) : ''

	const results = useMemo(() => matchSettings(query, locale), [query, locale])

	const registerNode = useCallback((id: string, node: HTMLElement | null) => {
		if (node) nodes.current.set(id, node)
		else nodes.current.delete(id)
	}, [])

	// Ctrl/Cmd+F focuses the search box, so the settings work like a tiny
	// command palette: type, arrow, enter.
	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
				event.preventDefault()
				searchRef.current?.focus()
				searchRef.current?.select()
			}
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [])

	useEffect(() => {
		return () => {
			if (flashTimer.current != null) window.clearTimeout(flashTimer.current)
		}
	}, [])

	function selectSection(id: SectionId) {
		setActiveSection(id)
		setQuery('')
		if (scrollRef.current) scrollRef.current.scrollTop = 0
	}

	function startResize(event: React.PointerEvent<HTMLDivElement>) {
		event.preventDefault()
		const startX = event.clientX
		const startWidth = sidebarWidth
		const onMove = (moveEvent: PointerEvent) => {
			setSidebarWidth(Math.min(340, Math.max(200, startWidth + moveEvent.clientX - startX)))
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	function selectTab(id: string) {
		setTabBySection((previous) => ({ ...previous, [activeSection]: id }))
		if (scrollRef.current) scrollRef.current.scrollTop = 0
	}

	/** Search hit → switch section/tab, then scroll to and flash the row. */
	function openResult(def: SettingDef) {
		setQuery('')
		setActiveSection(def.section)
		if (def.tab) setTabBySection((previous) => ({ ...previous, [def.section]: def.tab as string }))
		if (flashTimer.current != null) window.clearTimeout(flashTimer.current)
		// The target only exists once the section/tab render has committed, so keep
		// asking for a frame until the row registers itself (bounded).
		let attempts = 0
		const reveal = () => {
			const node = nodes.current.get(def.id)
			if (!node && attempts++ < 12) {
				window.requestAnimationFrame(reveal)
				return
			}
			if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' })
			setFlashId(def.id)
			flashTimer.current = window.setTimeout(() => setFlashId(null), FLASH_MS)
		}
		window.requestAnimationFrame(reveal)
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4 md:p-6" onMouseDown={() => setVisible(false)}>
			<div
				onMouseDown={(event) => event.stopPropagation()}
				className="flex h-[min(92vh,860px)] w-full max-w-[1200px] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
				<SettingsSidebar
					width={sidebarWidth}
					activeSection={activeSection}
					onSelectSection={selectSection}
					query={query}
					setQuery={setQuery}
					results={results}
					onOpenResult={openResult}
					version={vm.appVersion}
					onClose={() => setVisible(false)}
					searchRef={searchRef}
				/>

				{/* Hairline divider with a wider invisible hit area. */}
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label={m.settings()}
					onPointerDown={startResize}
					className="relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize bg-transparent"
				/>

				<div className="flex min-w-0 flex-1 flex-col">
					<header className="shrink-0 border-b border-border/55 px-6 pt-4">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<h2 className="text-lg font-semibold">{section.label()}</h2>
						</div>
						{tabs.length > 0 && (
							<div className="mt-2 flex flex-nowrap items-center gap-5 overflow-x-auto">
								{tabs.map((tab) => {
									const active = tab.id === activeTab
									return (
										<button
											key={tab.id}
											type="button"
											onClick={() => selectTab(tab.id)}
											className={cn(
											'shrink-0 border-b-2 px-0.5 pt-1 pb-2 text-[13px] transition-colors',
												active
													? 'border-primary font-medium text-foreground'
													: 'border-transparent text-muted-foreground hover:text-foreground',
											)}>
											{tab.label()}
										</button>
									)
								})}
							</div>
						)}
					</header>

					<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
						<SettingsUiProvider value={{ registerNode, flashId }}>
							{activeSection === 'general' && activeTab === 'about' && <AboutSection vm={vm} />}
							{activeSection === 'general' && activeTab !== 'about' && <GeneralSection vm={vm} tab={activeTab} onTranscriptOpened={() => setVisible(false)} />}
							{activeSection === 'appearance' && <AppearanceSection vm={vm} />}
							{activeSection === 'transcription' && <TranscriptionSection vm={vm} tab={activeTab} />}
							{activeSection === 'translation' && <TranslationSection tab={activeTab} />}
							{activeSection === 'summarize' && <SummarizeSection vm={vm} />}
							{activeSection === 'dictation' && <DictationSection />}
							{activeSection === 'gpu' && <GpuSection vm={vm} tab={activeTab} />}
							{activeSection === 'api' && <ApiSection vm={vm} />}
							{activeSection === 'advanced' && <AdvancedSection vm={vm} tab={activeTab} />}
						</SettingsUiProvider>
					</div>
				</div>
			</div>
		</div>
	)
}
