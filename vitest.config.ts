import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['src/renderer/src/__tests__/setup.ts'],
  },
  resolve: {
    // Allow tests to import from the renderer source tree without Vite's
    // electron-specific magic (no import.meta.env, no asset imports).
  },
})
