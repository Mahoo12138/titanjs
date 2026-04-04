/**
 * StyleManager - Handles theme style building and resolution.
 *
 * Extracted from Engine to separate style concerns.
 */
import type {
  TitanConfig,
  ResolvedTheme,
  PluginDefinition,
} from '@titan/types'
import { buildStyles } from './styles.js'

export class StyleManager {
  /**
   * Build and attach resolved styles to a theme.
   */
  async buildThemeStyles(
    theme: ResolvedTheme,
    plugins: PluginDefinition[],
    config: TitanConfig,
    rootDir: string,
  ): Promise<void> {
    const resolvedStyles = await buildStyles({
      themeDir: theme.rootDir,
      themeName: theme.definition.name,
      plugins: plugins.map(p => ({
        name: p.name,
        globalStyles: p.globalStyles,
        slotStyles: undefined,
      })),
      userStyles: config.styles?.tokens || config.styles?.global
        ? {
            tokens: config.styles.tokens,
            global: config.styles.global,
          }
        : undefined,
      rootDir,
    })

    for (const warning of resolvedStyles.warnings) {
      console.warn(`[style] ${warning}`)
    }

    theme.resolvedStyles = {
      css: resolvedStyles.css,
      warnings: resolvedStyles.warnings,
    }
    theme.styles = resolvedStyles.css
  }
}
