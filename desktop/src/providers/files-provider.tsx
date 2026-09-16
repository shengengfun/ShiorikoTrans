import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useDeepLinks } from '~/lib/use-deep-links'
import { useSingleInstance } from '~/lib/use-single-instance'
import { ModifyState, NamedPath } from '~/lib/types'

type FilesProviderState = NamedPath[]
interface FilesProviderContextType {
	files: FilesProviderState
	setFiles: ModifyState<FilesProviderState>
	/**
	 * Select files that must survive the destination page's "reset the previous
	 * selection when the route changes" effect (recent files, finished
	 * recordings). Plain `setFiles` loses that race, which is why callers used to
	 * wrap it in `setTimeout(..., 120)`.
	 */
	openFiles: (files: FilesProviderState) => void
	/**
	 * Consume the marker set by `openFiles`. Returns true only while `files` is
	 * still the selection that was armed, so a stale marker (another page picked
	 * its own files since) cannot suppress a later reset.
	 */
	consumeExplicitOpen: (files: FilesProviderState) => boolean
}

export const FilesProviderContext = createContext<FilesProviderContextType>({} as FilesProviderContextType)

export function useFilesContext() {
	return useContext(FilesProviderContext) as FilesProviderContextType
}

export function FilesProvider({ children }: { children: ReactNode }) {
	const [files, setFiles] = useState<FilesProviderState>([])
	const explicitOpen = useRef<FilesProviderState | null>(null)
	const location = useLocation()

	function openFiles(next: FilesProviderState) {
		explicitOpen.current = next
		setFiles(next)
	}

	function consumeExplicitOpen(current: FilesProviderState) {
		const armed = explicitOpen.current
		explicitOpen.current = null
		if (!armed) return false
		return armed.length === current.length && armed.every((file, index) => file.path === current[index]?.path)
	}

	// Files handed to us by the OS ("open with", deep links, a second launch) are
	// explicit selections too, so they go through `openFiles`.
	useDeepLinks({ setFiles: openFiles })
	useSingleInstance({ setFiles: openFiles })

	useEffect(() => {
		if (location?.state?.files) {
			setFiles(location?.state?.files)
		}
	}, [])
	return (
		<FilesProviderContext.Provider value={{ files, setFiles, openFiles, consumeExplicitOpen }}>{children}</FilesProviderContext.Provider>
	)
}
