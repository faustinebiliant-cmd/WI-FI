import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/platform/',
  plugins: [react()],
  server: { port: 3002 }
})