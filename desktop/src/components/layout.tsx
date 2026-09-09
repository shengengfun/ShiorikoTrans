import { ReactNode, useEffect, useState } from 'react'
import TitleBar from './title-bar'
import StatusBar from './status-bar'
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
		window.addEventListener('shiorikotrans:open-settings', onOpenSettings)
		return () => window.removeEventListener('shiorikotrans:open-settings', onOpenSettings)
	}, [])

	return (
		<div className="flex h-screen flex-col overflow-hidden text-foreground">
			{settingsVisible && <SettingsModal visible={settingsVisible} setVisible={setSettingsVisible} scrollTo={settingsScrollTo} />}
			<DropModal />
			<ModelDownloadPrompt />
			<TitleBar onOpenSettings={openSettings} />
			<main className="min-h-0 flex-1 overflow-y-auto">
				<PageTransition>
					<div className="app-shell">{children}</div>
				</PageTransition>
			</main>
			<StatusBar />
		</div>
	)
}
