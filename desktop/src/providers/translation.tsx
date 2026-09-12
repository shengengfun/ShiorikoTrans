import { Dispatch, ReactNode, SetStateAction, createContext, useContext } from 'react'
import { useLocalStorage } from 'usehooks-ts'

export type TranslationViewMode = 'side-by-side' | 'bilingual'

export interface TranslationSessionValue {
	source: string
	setSource: Dispatch<SetStateAction<string>>
	output: string
	setOutput: Dispatch<SetStateAction<string>>
	fileName: string
	setFileName: Dispatch<SetStateAction<string>>
	target: string
	setTarget: Dispatch<SetStateAction<string>>
	viewMode: TranslationViewMode
	setViewMode: Dispatch<SetStateAction<TranslationViewMode>>
}

const TranslationSessionContext = createContext<TranslationSessionValue | null>(null)

export function useTranslationSession() {
	return useContext(TranslationSessionContext) as TranslationSessionValue
}

export function TranslationSessionProvider({ children }: { children: ReactNode }) {
	const [source, setSource] = useLocalStorage('translation_source', '')
	const [output, setOutput] = useLocalStorage('translation_output', '')
	const [fileName, setFileName] = useLocalStorage('translation_file_name', '')
	const [target, setTarget] = useLocalStorage('prefs_translation_target', 'zh')
	const [viewMode, setViewMode] = useLocalStorage<TranslationViewMode>('prefs_translation_view_mode', 'side-by-side')

	return (
		<TranslationSessionContext.Provider
			value={{ source, setSource, output, setOutput, fileName, setFileName, target, setTarget, viewMode, setViewMode }}>
			{children}
		</TranslationSessionContext.Provider>
	)
}
