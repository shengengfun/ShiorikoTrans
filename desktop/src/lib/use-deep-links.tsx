import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { m } from '~/paraglide/messages.js'
import { NamedPath } from './types'
import { pathToNamedPath } from './fs'
import { ask } from '@tauri-apps/plugin-dialog'
import * as config from '~/lib/config'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import * as os from '@tauri-apps/plugin-os'
import { invoke } from '@tauri-apps/api/core'

interface UseDeepLinksProps {
	setFiles: (files: NamedPath[]) => void
}

export function useDeepLinks({ setFiles }: UseDeepLinksProps) {
	const navigate = useNavigate()

	async function processURLs(urls: string[]): Promise<void> {
		const newFiles: NamedPath[] = []
		for (let url of urls) {
			if (url.startsWith('shiorikotrans://download/?url=')) {
				const downloadURL = url.replace('shiorikotrans://download/?url=', '')
				const host = new URL(downloadURL).hostname
				const confirm = await ask(`${m.askForDownloadModel()} ${host}`, { kind: 'info', title: m.downloadModel() })
				if (confirm) {
					navigate('/setup', { state: { downloadURL } })
				}
				break
			} else if (config.videoExtensions.some((e) => url.endsWith(e)) || config.audioExtensions.some((e) => url.endsWith(e))) {
				url = url.replace('file://', '')
				url = decodeURIComponent(url)
				const newFile = await pathToNamedPath(url)
				newFiles.push(newFile)
			}
		}
		if (newFiles.length === 0) return
		setFiles(newFiles)
		navigate('/')
	}

	async function handleArgv() {
		const argv = await invoke<string[]>('get_argv')
		await processURLs(argv)
	}

	async function handleDeepLinks() {
		const platform = await os.platform()
		if (['windows', 'linux'].includes(platform)) {
			return
		}
		onOpenUrl(async (urls) => {
			await processURLs(urls)
		})
	}

	useEffect(() => {
		handleArgv()
		handleDeepLinks()
	}, [])
}
