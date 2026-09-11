import { useEffect } from 'react'
import { getTextDirection } from '~/paraglide/runtime.js'
import { Route, Routes } from 'react-router-dom'
import '~/globals.css'
import SetupPage from '~/pages/setup/page'
import HomePage from '~/pages/home/page'
import BatchPage from './pages/batch/page'
import TranslatePage from './pages/translate/page'
import { ErrorModalProvider } from './providers/error-modal'
import { PreferenceProvider } from './providers/preference'
import { usePreferenceProvider } from './providers/preference'
import { ErrorBoundary } from 'react-error-boundary'
import { BoundaryFallback } from './components/boundary-fallback'
import ErrorModalWithContext from './components/error-modal-with-context'
import { FilesProvider } from './providers/files-provider'
import { HotkeyProvider } from './providers/hotkey'
import { TranscriptionProvider } from '~/providers/transcription'
import { ToastProvider } from './providers/toast'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { DirectionProvider } from '~/components/ui/direction'

export default function App() {
	return (
		<PreferenceProvider>
			<AppContent />
		</PreferenceProvider>
	)
}

function AppContent() {
	const { displayLanguage } = usePreferenceProvider()
	const dir = getTextDirection(displayLanguage)

	useEffect(() => {
		document.body.dir = dir
	}, [dir])

	return (
		<DirectionProvider dir={dir}>
			<ErrorBoundary FallbackComponent={BoundaryFallback}>
				<ErrorModalProvider>
					<TooltipProvider>
						<ToastProvider>
							<HotkeyProvider>
								<ErrorModalWithContext />
								<FilesProvider>
									<TranscriptionProvider>
										<Routes>
											<Route path="/" element={<HomePage />} />
											<Route path="/setup" element={<SetupPage />} />
											<Route path="/batch" element={<BatchPage />} />
											<Route path="/translate" element={<TranslatePage />} />
										</Routes>
									</TranscriptionProvider>
								</FilesProvider>
								<Toaster position="bottom-right" />
							</HotkeyProvider>
						</ToastProvider>
					</TooltipProvider>
				</ErrorModalProvider>
			</ErrorBoundary>
		</DirectionProvider>
	)
}
