import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Build output goes to /reviewer/ at the project root so Vercel
// serves it directly at the /reviewer/ URL without needing rewrites.
// base: '/reviewer/' makes all asset URLs absolute and prefixed.
export default defineConfig({
  plugins: [react()],
  base: '/reviewer/',
  build: {
    outDir: path.resolve(__dirname, '../reviewer'),
    emptyOutDir: true,
  },
})
