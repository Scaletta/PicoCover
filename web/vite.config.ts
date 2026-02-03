import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    wasm(), 
    topLevelAwait(), 
    tailwindcss()
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
    __GIT_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev')
  },
  base: '/PicoCover/',
  build: {
    outDir: 'dist',
    target: 'esnext',
    assetsInlineLimit: 0, // Don't inline WASM files
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['pico_cover_wasm']
  }
})
