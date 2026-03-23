/**
 * @titan/vite-plugin - Vite integration for Titan SSG
 *
 * Responsibilities:
 * - Bridge Markdown asset references into Vite's module graph
 *   via virtual modules so Vite processes/hashes them
 * - Provide dev server middleware for Titan's dev mode
 * - Handle HMR for Markdown content changes
 */
import path from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { TitanConfig } from '@titan/types'

export interface TitanVitePluginOptions {
  /** Project root */
  rootDir: string
  /** Titan config */
  config: TitanConfig
  /** Callback when a source file changes (for dev mode rebuild) */
  onFileChange?: (filePath: string) => void
}

const VIRTUAL_ASSETS_ID = 'virtual:titan-assets'
const RESOLVED_VIRTUAL_ASSETS_ID = '\0' + VIRTUAL_ASSETS_ID

/**
 * Create the Titan Vite plugin
 */
export function titanVitePlugin(options: TitanVitePluginOptions): Plugin {
  const { rootDir, config, onFileChange } = options
  const sourceDir = path.join(rootDir, config.source)

  // Collected asset paths from Markdown processing
  let assetImports: string[] = []

  return {
    name: 'titan',
    enforce: 'pre',

    // Resolve virtual module for assets
    resolveId(id) {
      if (id === VIRTUAL_ASSETS_ID) {
        return RESOLVED_VIRTUAL_ASSETS_ID
      }
    },

    // Generate virtual module content: import all collected assets
    load(id) {
      if (id === RESOLVED_VIRTUAL_ASSETS_ID) {
        // Generate import statements for all asset references
        const imports = assetImports.map(
          (asset, i) => `import asset${i} from ${JSON.stringify(asset)}`
        )
        const exports = assetImports.map(
          (_, i) => `asset${i}`
        )
        return [
          ...imports,
          `export default { ${exports.join(', ')} }`,
        ].join('\n')
      }
    },

    // Dev server configuration
    configureServer(server: ViteDevServer) {
      // Watch source directory for changes
      server.watcher.add(sourceDir)

      server.watcher.on('change', (filePath) => {
        if (filePath.startsWith(sourceDir) && filePath.endsWith('.md')) {
          onFileChange?.(filePath)
          // Trigger full page reload for Markdown changes
          server.ws.send({ type: 'full-reload' })
        }
      })

      // Serve generated HTML in dev mode
      server.middlewares.use((req, res, next) => {
        // Let the dev server handle asset requests normally
        next()
      })
    },

    // Build configuration
    config() {
      return {
        build: {
          outDir: path.join(rootDir, config.build.outDir),
          emptyOutDir: true,
        },
      }
    },
  }
}

/**
 * Update the asset imports list (called from Engine during transform)
 */
export function setAssetImports(imports: string[]): void {
  // This will be used to populate the virtual module
  // In a full implementation, this would communicate with the plugin instance
}

export { titanVitePlugin as default }
