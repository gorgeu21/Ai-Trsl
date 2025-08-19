import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you publish to https://<user>.github.io/Ai-Trsl/ set base to '/Ai-Trsl/'
export default defineConfig({
  base: '/Ai-Trsl/',
  plugins: [react()]
})
