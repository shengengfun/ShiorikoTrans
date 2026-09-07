import { Dispatch, SetStateAction } from 'react'

export interface NamedPath {
	name: string
	path: string
	is_dir?: boolean
}

export interface ModelGroup {
	name: string
	path: string
	is_dir: boolean
	files: NamedPath[]
}

export type ModifyState<T> = Dispatch<SetStateAction<T>>
