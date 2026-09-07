import i18n, { LanguageDetectorAsyncModule } from 'i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next/initReactI18next'

// See src-tauri/locales/ for the list of supported languages
// Please keep the list sorted alphabetically
export const supportedLanguages: { [key: string]: string } = {
	'en-US': 'english', // English
	'es-ES': 'spanish (ES)', // Spanish (ES)
	'es-MX': 'spanish (MX)', // Spanish (MX)
	'fr-FR': 'french', // French
	'he-IL': 'hebrew', // Hebrew
	'hi-IN': 'hindi', // Hindi
	'it-IT': 'italian', // Italian
	'ja-JP': 'japanese', // Japanese
	'ko-KR': 'korean', // Korean
	'no-NO': 'norwegian', // Norwegian
	'pl-PL': 'polish', // Polish
	'pt-BR': 'portuguese', // Portuguese (BR)
	'ru-RU': 'russian', // Russian
	'sv-SE': 'swedish', // Swedish
	'ta-IN': 'tamil', // Tamil
	'vi-VN': 'vietnamese', // Vietnamese
	'zh-CN': 'chinese', // Chinese (Simplified)
	'zh-HK': 'chinese (HK)', // Chinese (Traditional)
}
export const supportedLanguageKeys = Object.keys(supportedLanguages)
export const supportedLanguageValues = Object.values(supportedLanguages)

export function getI18nLanguageName() {
	const name = supportedLanguages[i18n.language as keyof typeof supportedLanguages]
	return name
}

// Detect system locale or use stored preference
async function detectLocale(): Promise<string> {
	// Check for stored preference first
	const prefsLanguage = localStorage.getItem('prefs_display_language')
	if (prefsLanguage) {
		try {
			return JSON.parse(prefsLanguage)
		} catch {}
	}

	// Try Electron API
	if ((window as any).electronAPI?.locale) {
		return (window as any).electronAPI.locale()
	}

	// Fallback to browser
	return navigator.language || 'en-US'
}

const LanguageDetector: LanguageDetectorAsyncModule = {
	type: 'languageDetector',
	async: true,
	detect: (callback) => {
		detectLocale().then((detectedLocale) => {
			callback(detectedLocale || 'en-US')
		})
	},
}

// Load locale files via fetch (works in both dev and production)
async function loadLocaleResources(language: string): Promise<any> {
	if (!supportedLanguageKeys.includes(language)) {
		return {}
	}

	const namespaces = ['common', 'language']
	const translations: any = {}

	try {
		// In dev mode, files are served from /locales/
		// In production, they're copied to the app resources
		const baseUrl = `/locales/${language}`

		await Promise.all(
			namespaces.map(async (ns) => {
				try {
					const response = await fetch(`${baseUrl}/${ns}.json`)
					if (response.ok) {
						translations[ns] = await response.json()
					}
				} catch (e) {
					console.warn(`Failed to load locale: ${language}/${ns}.json`, e)
				}
			}),
		)
	} catch (e) {
		console.warn(`Failed to load locale directory: ${language}`, e)
	}

	return translations
}

i18n.use(LanguageDetector)
	.use(initReactI18next)
	.use(
		resourcesToBackend(async (language: string) => {
			return loadLocaleResources(language)
		}),
	)
	.init({
		debug: false,
		fallbackLng: 'en-US',
		interpolation: {
			escapeValue: false, // not needed for react as it escapes by default
		},
	})
export default i18n
