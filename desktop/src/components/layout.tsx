import { ReactNode, useEffect, useState } from 'react'
import { m } from '~/paraglide/messages.js'
import AppMenu from './app-menu'
import DropModal from './drop-modal'
import SettingsModal from './settings-modal'
import PageTransition from './page-transition'
import ModelDownloadPrompt from './model-download-prompt'

export default function Layout({ children }: { children: ReactNode }) {
	const [settingsVisible, setSettingsVisible] = useState(false)
	const [settingsScrollTo, setSettingsScrollTo] = useState<string | undefined>(undefined)

	function openSettings(scrollTo?: string) {
		setSettingsScrollTo(scrollTo)
		setSettingsVisible(true)
	}

	useEffect(() => {
		function onOpenSettings(event: Event) {
			const scrollTo = (event as CustomEvent<{ scrollTo?: string }>).detail?.scrollTo
			openSettings(scrollTo)
		}
		window.addEventListener('audire:open-settings', onOpenSettings)
		return () => window.removeEventListener('audire:open-settings', onOpenSettings)
	}, [])

	return (
		<div className="min-h-screen">
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} scrollTo={settingsScrollTo} />}
			<DropModal />
			<ModelDownloadPrompt />
			<div className="app-shell">
				<div className="stagger-in mb-6 flex items-center justify-between gap-4 pb-1">
					<h1 className="app-title">{m.appTitle()}</h1>
					<AppMenu onClickSettings={openSettings} />
				</div>
				<PageTransition>
					<div className="stagger-in [animation-delay:120ms]">{children}</div>
				</PageTransition>
			</div>
		</div>
	)
}
