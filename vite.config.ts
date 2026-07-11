import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'https://heovcenter.gov.taipei',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/cia/WebLayout'),
      },
      '/api2': {
        target: 'https://heovcenter2.gov.taipei',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api2/, '/cia/WebLayout'),
      },
    },
  },
})