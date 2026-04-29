import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'node-gyp-build']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'node-gyp-build']
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()]
  }
})
