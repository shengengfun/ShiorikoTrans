// Compatibility shim: @tauri-apps/api/event
export { listen, emit } from '~/lib/electron-adapter'
export type UnlistenFn = () => void
