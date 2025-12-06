import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base URL must match your repository name for GitHub Pages
  base: '/Imagination/', 
  build: {
    outDir: 'dist',
  }
})