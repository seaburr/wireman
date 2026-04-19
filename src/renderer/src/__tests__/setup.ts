// Global mocks required for the store (Electron IPC not available in Vitest)
;(globalThis as any).window = {
  api: {
    saveHarness: () => Promise.resolve({ ok: true }),
    loadHarness: () => Promise.resolve({ ok: false, json: null }),
    exportImage: () => Promise.resolve({ ok: true }),
  },
}
