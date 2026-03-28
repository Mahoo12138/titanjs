import { defineConfig } from 'tsup'
import { cpSync } from 'node:fs'

export default defineConfig({
  entry: [
    'src/theme.config.mjs',
    'src/layouts/*.tsx',
  ],
  outDir: 'dist',
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  // Keep external packages unbundled
  external: ['preact', 'preact/jsx-runtime', '@titan/core', '@titan/types'],
  onSuccess: async () => {
    // Copy CSS styles to dist/styles/
    cpSync('src/styles', 'dist/styles', { recursive: true })
  },
})
