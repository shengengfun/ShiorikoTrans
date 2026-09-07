// Compatibility shim: @tauri-apps/api/core
// Re-exports the Electron adapter with the same invoke() API
export { invoke, convertFileSrc } from '~/lib/electron-adapter'
