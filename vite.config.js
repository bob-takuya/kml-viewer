import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import corsProxyPlugin from './vite-proxy-plugin.js'

export default defineConfig({
  plugins: [react(), corsProxyPlugin()],
  assetsInclude: ['**/*.fbx'],
  base: '/kml-viewer/',
  server: {
    cors: true
  }
})
