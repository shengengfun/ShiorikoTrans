import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

export function useConfirmExit(shouldConfirm: boolean) {
	const { t } = useTranslation()
	useEffect(() => {
		const handler = (e: BeforeUnloadEvent) => {
			if (shouldConfirm) {
				e.preventDefault()
				e.returnValue = '' // Required for Chrome
			}
		}
		window.addEventListener('beforeunload', handler)
		return () => window.removeEventListener('beforeunload', handler)
	}, [shouldConfirm])
}
