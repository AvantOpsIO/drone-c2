/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
      '/video': 'http://localhost:8080',
    },
    headers: {
      // WHY: SharedArrayBuffer requires cross-origin isolation headers even in
      // dev mode. Without these, SAB allocation fails and Tier A is dead.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  build: {
    outDir: '../cmd/server/static',
    emptyOutDir: true,
    // WHY manual chunks: Leaflet is ~150KB — splitting it from app code means
    // the main bundle stays small and the map library is cached independently.
    // Vite 8 (Rolldown) requires manualChunks as a function, not an object.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/leaflet')) return 'leaflet'
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand')) return 'vendor'
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})
