import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/reviewer/',
  build: {
    outDir: path.resolve(__dirname, '../public/reviewer'),
    emptyOutDir: true,
  },
})
