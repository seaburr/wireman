/// <reference types="vite/client" />

interface Window {
  api: {
    saveHarness(json: string, projectName: string): Promise<{ ok: boolean; filePath?: string }>
    loadHarness(): Promise<{ ok: boolean; json: string | null }>
  }
}
