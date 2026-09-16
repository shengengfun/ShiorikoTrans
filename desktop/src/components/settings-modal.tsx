import { useEffect } from 'react'
import { ModifyState } from '~/lib/types'
import SettingsPage from '~/pages/settings/page'

interface SettingsModalProps {
	visible: boolean
	setVisible: ModifyState<boolean>
	scrollTo?: string
}

export default function SettingsModal({ visible, setVisible, scrollTo }: SettingsModalProps) {
	useEffect(() => {
		if (!visible) return

		const prevBodyOverflow = document.body.style.overflow
		const prevHtmlOverflow = document.documentElement.style.overflow
		document.body.style.overflow = 'hidden'
		document.documentElement.style.overflow = 'hidden'

		// Esc closes the dialog unless the settings search box is handling it
		// (there Esc clears the query first, see `SettingsSidebar`).
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape' && !event.defaultPrevented) setVisible(false)
		}
		window.addEventListener('keydown', onKeyDown)

		return () => {
			window.removeEventListener('keydown', onKeyDown)
			document.body.style.overflow = prevBodyOverflow
			document.documentElement.style.overflow = prevHtmlOverflow
		}
	}, [visible, setVisible])

	if (!visible) return null

	return (
		<div className="fixed inset-0 z-50 overflow-hidden bg-black/45 backdrop-blur-md">
			<div className="h-full overflow-hidden overscroll-contain">
				<SettingsPage setVisible={setVisible} scrollTo={scrollTo} />
			</div>
		</div>
	)
}
