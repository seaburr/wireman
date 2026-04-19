import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  saveHarness: (json: string, projectName: string): Promise<{ ok: boolean; filePath?: string }> =>
    ipcRenderer.invoke('save-harness', json, projectName),
  loadHarness: (): Promise<{ ok: boolean; json: string | null }> =>
    ipcRenderer.invoke('load-harness'),
  exportImage: (base64: string, projectName: string): Promise<{ ok: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export-image', base64, projectName),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
