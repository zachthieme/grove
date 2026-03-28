import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    env: { TZ: 'UTC' },
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      exclude: ['e2e/**', 'node_modules/**', '**/*.test.*', '**/*.spec.*'],
      thresholds: {
        statements: 73,
        branches: 66,
        functions: 64,
        lines: 75,
      },
    },
  },
})
