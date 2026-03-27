/**
 * Titan plugin factory for Stellar-style tag plugins.
 *
 * Injects `remark-directive` + `remarkStellarDirectives` into the
 * Markdown pipeline so that directive syntax is parsed and
 * transformed to semantic HTML.
 */
import type { PluginDefinition } from '@titan/types'
import remarkDirective from 'remark-directive'
import { remarkStellarDirectives, type StellarDirectivesOptions } from './remark-stellar.js'
import tagPluginCSS from './tag-plugins.css'

export interface TagPluginsOptions extends StellarDirectivesOptions {
  /** CSS class prefix (default: 'tag-') — reserved for future use */
  classPrefix?: string
}

export function pluginTagPlugins(options: TagPluginsOptions = {}): PluginDefinition {
  return {
    name: '@titan/plugin-tag-plugins',

    // Remark plugins injected into the core Markdown processor
    remarkPlugins: [
      remarkDirective,                        // parse ::: / :: / : syntax
      [remarkStellarDirectives, options],     // transform directive nodes → HTML
    ],

    // CSS for the generated .tag-* class names (unscoped, must match remark output)
    globalStyles: tagPluginCSS as unknown as string,
  }
}
