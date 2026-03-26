import { defineConfig } from 'tsup'
import { copyFileSync, mkdirSync } from 'node:fs'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  onSuccess: async () => {
    // Copy assets to dist/assets
    mkdirSync('dist/assets', { recursive: true })
    copyFileSync('assets/titan-base.css', 'dist/assets/titan-base.css')
  },
})
