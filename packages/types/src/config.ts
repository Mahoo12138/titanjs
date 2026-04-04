/**
 * Configuration types
 */
import type { z } from 'zod'

export interface TitanConfig {
  /** Site title */
  title: string
  /** Site URL */
  url: string
  /** Site language (BCP 47) */
  language: string

  /** Source directory (relative to project root) */
  source: string

  /** Build options */
  build: BuildConfig

  /** Markdown processing options */
  markdown: MarkdownConfig

  /** Style system options */
  styles: StyleConfig

  /** Plugins */
  plugins: PluginDefinition[]

  /** Theme */
  theme?: string | ThemeReference
}

export interface BuildConfig {
  /** Output directory */
  outDir: string
  /** Cache directory */
  cacheDir: string
  /** Concurrent article processing count */
  concurrency: number
}

export interface MarkdownConfig {
  /** remark plugins */
  remarkPlugins: unknown[]
  /** rehype plugins */
  rehypePlugins: unknown[]
  /** Code highlighting options */
  highlight?: {
    theme: string
  }
}

export interface StyleConfig {
  /** Design token overrides (--t-* values) */
  tokens: Record<string, string>
  /** Additional global CSS file path */
  global?: string
  /** Dark mode strategy */
  darkMode?: 'class' | 'media' | 'both'
}

/**
 * Theme reference — supports multiple resolution strategies:
 *
 * **String shorthand:**
 * - Relative/absolute path: `'../themes/stellar'`, `'./my-theme'`
 * - Short name (convention): `'stellar'` → tries `themes/stellar/`, then
 *   `titan-theme-stellar` and `@titan/theme-stellar` in node_modules
 * - Full npm package: `'titan-theme-stellar'`, `'@titan/theme-stellar'`,
 *   `'@my-org/my-theme'`
 *
 * **Object form** (with theme config overrides):
 * ```js
 * theme: { name: 'stellar', config: { primaryColor: '#f00' } }
 * ```
 */
export type ThemeReference = {
  name: string
  config?: Record<string, unknown>
}

// ── Plugin Definition (Phase 2) ──

export interface PluginDefinition {
  name: string
  /** Content type registrations */
  collections?: import('./collection.js').CollectionDefinition[]
  /** Singleton data registrations */
  singletons?: import('./singleton.js').SingletonDefinition[]
  /** IoC: data keys this plugin depends on */
  inject?: string[]
  /** IoC: data keys this plugin produces */
  produces?: string[]
  /** Pipeline hooks */
  hooks?: PluginHooks
  /** Theme slot components (Phase 3) */
  slotComponents?: import('./theme.js').SlotComponentDefinition[]
  /** Additional remark plugins to inject into the Markdown pipeline (Phase 4) */
  remarkPlugins?: unknown[]
  /** Additional rehype plugins to inject into the Markdown pipeline (Phase 4) */
  rehypePlugins?: unknown[]
  /** Global CSS to inject into every page (unscoped, for generated class names) */
  globalStyles?: string
  /**
   * Optional lifecycle: called once during Engine.init() after plugin registration.
   * Use for resource initialization (HTTP clients, file watchers, etc.)
   */
  setup?: (context: PluginSetupContext) => Promise<void> | void
  /**
   * Optional lifecycle: called during Engine.clean() for cleanup.
   * Use for releasing resources acquired in setup().
   */
  teardown?: () => Promise<void> | void
}

export interface PluginSetupContext {
  /** Project root directory */
  rootDir: string
  /** Resolved config */
  config: TitanConfig
}

export interface PluginHooks {
  'load:before'?: import('./pipeline.js').Middleware<import('./pipeline.js').LoadContext>
  'load:after'?: import('./pipeline.js').Middleware<import('./pipeline.js').LoadContext>
  'transform:entry'?: import('./pipeline.js').Middleware<import('./pipeline.js').TransformContext>
  'transform:post'?: import('./pipeline.js').Middleware<import('./pipeline.js').TransformContext>
  'transform:page'?: import('./pipeline.js').Middleware<import('./pipeline.js').TransformContext>
  'generate:before'?: import('./pipeline.js').Middleware<import('./pipeline.js').GenerateContext>
  'generate:routes'?: import('./pipeline.js').Middleware<import('./pipeline.js').GenerateContext>
  'generate:after'?: import('./pipeline.js').Middleware<import('./pipeline.js').GenerateContext>
  'emit:before'?: import('./pipeline.js').Middleware<import('./pipeline.js').EmitContext>
  'emit:after'?: import('./pipeline.js').Middleware<import('./pipeline.js').EmitContext>
}

/** Deep partial for user config (most fields optional) */
export type UserConfig = Partial<TitanConfig>
