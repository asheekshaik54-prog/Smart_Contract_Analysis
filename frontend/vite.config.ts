import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dev: proxy API calls to the FastAPI backend so no CORS setup is needed locally.
const target = process.env.VITE_DEV_API ?? 'http://127.0.0.1:8000'
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': target, '/health': target, '/ready': target } },
  preview: { port: 4173, proxy: { '/api': target, '/health': target, '/ready': target } },
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'jsdom', setupFiles: ['./src/tests/setup.ts'], globals: true, css: false },
})
