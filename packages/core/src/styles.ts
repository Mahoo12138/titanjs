/**
 * Style System - 5-layer CSS architecture
 *
 * Layer 1: Framework Reset (titan-base.css)
 * Layer 2: Theme Global (tokens.css + global.css)
 * Layer 3: Theme Components (CSS Modules - scoped)
 * Layer 4: Plugin Components (Slot component CSS - scoped)
 * Layer 5: User Overrides (token overrides + custom CSS)
 *
 * Responsibilities:
 * - Load and validate each style layer
 * - Validate token completeness (theme must assign all --t-* tokens)
 * - Lint plugin CSS (must only use --t-* tokens, no hardcoded colors)
 * - Scope component CSS class names (theme & plugin)
 * - Merge all layers into final CSS
 * - Apply user token overrides from config
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Token Registry ──

/**
 * All design tokens declared by the framework.
 * Theme must assign every token; plugins must only reference these.
 */
export const DESIGN_TOKENS = [
  // Colors
  '--t-color-bg',
  '--t-color-bg-subtle',
  '--t-color-surface',
  '--t-color-border',
  '--t-color-text',
  '--t-color-text-muted',
  '--t-color-accent',
  '--t-color-accent-hover',
  '--t-color-code-bg',
  '--t-color-tag-bg',
  '--t-color-tag-text',
  // Typography
  '--t-font-sans',
  '--t-font-mono',
  '--t-font-serif',
  '--t-text-xs',
  '--t-text-sm',
  '--t-text-base',
  '--t-text-lg',
  '--t-text-xl',
  '--t-text-2xl',
  '--t-text-3xl',
  '--t-leading-tight',
  '--t-leading-normal',
  '--t-leading-relaxed',
  // Spacing
  '--t-space-1',
  '--t-space-2',
  '--t-space-4',
  '--t-space-6',
  '--t-space-8',
  '--t-space-12',
  '--t-space-16',
  // Borders & Shadows
  '--t-radius-sm',
  '--t-radius-md',
  '--t-radius-lg',
  '--t-radius-full',
  '--t-shadow-sm',
  '--t-shadow-md',
  '--t-shadow-lg',
  // Z-Index
  '--t-z-base',
  '--t-z-dropdown',
  '--t-z-modal',
  '--t-z-toast',
  // Layout
  '--t-max-width',
  '--t-header-height',
] as const

export type DesignToken = typeof DESIGN_TOKENS[number]

// ── Style Layers ──

export interface StyleLayers {
  /** Layer 1: Framework reset + token declarations */
  base: string
  /** Layer 2: Theme tokens + global styles */
  themeGlobal: string
  /** Layer 3: Theme component styles (scoped) */
  themeComponents: string
  /** Layer 4: Plugin component styles (scoped) */
  pluginComponents: string
  /** Layer 5: User overrides (token + custom CSS) */
  userOverrides: string
}

export interface ResolvedStyles {
  /** All layers merged into one CSS string */
  css: string
  /** Individual layers for fine-grained injection */
  layers: StyleLayers
  /** Validation warnings (non-fatal) */
  warnings: string[]
}

// ── Layer 1: Framework Base ──

let cachedBase: string | null = null

/**
 * Load the framework base CSS (titan-base.css)
 */
export async function loadFrameworkBase(): Promise<string> {
  if (cachedBase) return cachedBase
  const assetsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'assets',
  )
  const basePath = path.join(assetsDir, 'titan-base.css')
  cachedBase = await fs.readFile(basePath, 'utf-8')
  return cachedBase
}

// ── Layer 2: Theme Global ──

export interface ThemeStylePaths {
  tokensPath?: string
  globalPath?: string
  /** Legacy single-file style (backward compat) */
  legacyStylePath?: string
}

/**
 * Discover theme style files
 * Supports both new structure (styles/tokens.css + styles/global.css)
 * and legacy structure (style.css)
 */
export async function discoverThemeStyles(themeDir: string): Promise<ThemeStylePaths> {
  const result: ThemeStylePaths = {}

  // New structure: styles/ directory
  const stylesDir = path.join(themeDir, 'styles')
  if (await exists(stylesDir)) {
    const tokensPath = path.join(stylesDir, 'tokens.css')
    if (await exists(tokensPath)) result.tokensPath = tokensPath

    const globalPath = path.join(stylesDir, 'global.css')
    if (await exists(globalPath)) result.globalPath = globalPath
  }

  // Legacy structure: style.css in theme root
  if (!result.tokensPath && !result.globalPath) {
    for (const name of ['style.css', 'styles.css', 'index.css']) {
      const p = path.join(themeDir, name)
      if (await exists(p)) {
        result.legacyStylePath = p
        break
      }
    }
  }

  return result
}

/**
 * Load the theme's global CSS layer
 */
export async function loadThemeGlobalStyles(themeDir: string): Promise<string> {
  const paths = await discoverThemeStyles(themeDir)
  const parts: string[] = []

  if (paths.tokensPath) {
    parts.push(`/* Theme Tokens */\n${await fs.readFile(paths.tokensPath, 'utf-8')}`)
  }
  if (paths.globalPath) {
    parts.push(`/* Theme Global */\n${await fs.readFile(paths.globalPath, 'utf-8')}`)
  }
  if (paths.legacyStylePath) {
    parts.push(await fs.readFile(paths.legacyStylePath, 'utf-8'))
  }

  return parts.join('\n\n')
}

// ── Layer 5: User Overrides ──

/**
 * Generate CSS for user token overrides from titan.config
 */
export function generateUserTokenOverrides(tokens: Record<string, string>): string {
  const entries = Object.entries(tokens)
  if (entries.length === 0) return ''

  const lines = entries.map(([key, value]) => `  ${key}: ${value};`)
  return `:root {\n${lines.join('\n')}\n}`
}

/**
 * Load user's custom global CSS file
 */
export async function loadUserGlobalCSS(
  globalPath: string,
  rootDir: string,
): Promise<string> {
  const resolved = path.resolve(rootDir, globalPath)
  if (!await exists(resolved)) {
    throw new Error(`User global CSS file not found: ${globalPath}`)
  }
  return fs.readFile(resolved, 'utf-8')
}

// ── Token Validation ──

/**
 * Extract --t-* token assignments from CSS text.
 * Returns set of token names that have non-empty values assigned.
 */
export function extractAssignedTokens(css: string): Set<string> {
  const assigned = new Set<string>()
  // Match --t-XXXX: <value>; where value is non-empty
  const regex = /(-{2}t-[\w-]+)\s*:\s*([^;]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(css)) !== null) {
    const value = match[2].trim()
    // Skip empty declarations (just whitespace)
    if (value && value !== '') {
      assigned.add(match[1])
    }
  }
  return assigned
}

/**
 * Validate that the theme provides all required design tokens
 */
export function validateTokenCompleteness(
  themeCSS: string,
  themeName: string,
): string[] {
  const assigned = extractAssignedTokens(themeCSS)
  const warnings: string[] = []

  for (const token of DESIGN_TOKENS) {
    if (!assigned.has(token)) {
      warnings.push(
        `Theme "${themeName}" does not assign token ${token}. ` +
        `This may cause unstyled elements.`,
      )
    }
  }

  return warnings
}

// ── Plugin CSS Lint ──

/**
 * Color value patterns that indicate hardcoded colors
 * (not using design tokens)
 */
const HARDCODED_COLOR_PATTERNS = [
  // Hex colors: #fff, #ffffff, #ffffffaa
  /#[0-9a-fA-F]{3,8}\b/,
  // rgb/rgba/hsl/hsla functions
  /\b(?:rgb|rgba|hsl|hsla)\s*\(/,
  // Named colors (common subset)
  /\b(?:red|blue|green|black|white|gray|grey|orange|purple|yellow|pink|brown|cyan|magenta|navy|teal|lime|maroon|olive|aqua|silver|fuchsia)\b/,
]

/**
 * Properties that typically contain color values
 */
const COLOR_PROPERTIES = [
  'color',
  'background-color',
  'background',
  'border-color',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'outline-color',
  'outline',
  'box-shadow',
  'text-shadow',
  'text-decoration-color',
  'fill',
  'stroke',
]

export interface CSSLintViolation {
  line: number
  property: string
  value: string
  message: string
}

/**
 * Lint plugin CSS for hardcoded color values.
 * Plugins must only use --t-* tokens for colors to ensure
 * dark mode and theme compatibility.
 */
export function lintPluginCSS(
  css: string,
  pluginName: string,
): CSSLintViolation[] {
  const violations: CSSLintViolation[] = []
  const lines = css.split('\n')

  // Track if we're inside a comment block
  let inComment = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Handle block comments
    if (inComment) {
      if (line.includes('*/')) inComment = false
      continue
    }
    if (line.trimStart().startsWith('/*')) {
      if (!line.includes('*/')) inComment = true
      continue
    }
    // Skip single-line comments
    if (line.trimStart().startsWith('//')) continue

    // Find all property: value declarations on this line
    const declRegex = /([\w-]+)\s*:\s*([^;{}]+)/g
    let match: RegExpExecArray | null
    while ((match = declRegex.exec(line)) !== null) {
      const property = match[1]
      const value = match[2].trim()

      // Only lint color-related properties
      if (!COLOR_PROPERTIES.some(p => property === p || property.startsWith(`${p}-`))) continue

      // Skip values that use CSS variables (design tokens)
      if (value.includes('var(--t-')) continue

      // Check for hardcoded color patterns
      for (const pattern of HARDCODED_COLOR_PATTERNS) {
        if (pattern.test(value)) {
          violations.push({
            line: i + 1,
            property,
            value,
            message:
              `Plugin "${pluginName}": hardcoded color in ${property} (line ${i + 1}). ` +
              `Use --t-* design tokens instead: ${value}`,
          })
          break
        }
      }
    }
  }

  return violations
}

// ── CSS Scoping ──

/**
 * Simple hash function for CSS class scoping
 */
function shortHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36).slice(0, 4)
}

/**
 * Scope CSS class names with a prefix and short hash.
 *
 * Rule: .className → .{scope}__{className}_{hash}
 *
 * This is a lightweight scoping approach. For full CSS Modules support
 * (import { styles } from './X.module.css'), a Vite plugin is needed.
 */
export function scopeCSS(
  css: string,
  scope: string,
  sourceFile: string,
): { css: string; classMap: Record<string, string> } {
  const hash = shortHash(`${scope}:${sourceFile}`)
  const classMap: Record<string, string> = {}

  // Replace .className occurrences in selectors
  const scoped = css.replace(
    /\.([a-zA-Z_][\w-]*)/g,
    (match, className) => {
      // Don't scope framework classes (titan-*)
      if (className.startsWith('titan-')) return match
      // Don't scope common global classes
      if (['dark', 'light', 'sr-only'].includes(className)) return match

      const scopedName = `${scope}__${className}_${hash}`
      classMap[className] = scopedName
      return `.${scopedName}`
    },
  )

  return { css: scoped, classMap }
}

// ── Main Orchestrator ──

export interface BuildStylesOptions {
  /** Theme directory */
  themeDir: string
  /** Theme name (for scoping & error messages) */
  themeName: string
  /** Plugins with slot components */
  plugins: Array<{ name: string; slotStyles?: string }>
  /** User style config */
  userStyles?: {
    tokens?: Record<string, string>
    global?: string
  }
  /** Project root directory */
  rootDir: string
}

/**
 * Build the complete style output for a site.
 * Loads, validates, scopes, and merges all 5 layers.
 */
export async function buildStyles(options: BuildStylesOptions): Promise<ResolvedStyles> {
  const { themeDir, themeName, plugins, userStyles, rootDir } = options
  const warnings: string[] = []

  // Layer 1: Framework base
  const base = await loadFrameworkBase()

  // Layer 2: Theme global
  const themeGlobal = await loadThemeGlobalStyles(themeDir)

  // Validate token completeness
  const tokenWarnings = validateTokenCompleteness(themeGlobal, themeName)
  warnings.push(...tokenWarnings)

  // Layer 3: Theme components (future: load .module.css files)
  const themeComponents = ''

  // Layer 4: Plugin components
  const pluginParts: string[] = []
  for (const plugin of plugins) {
    if (!plugin.slotStyles) continue
    // Lint plugin CSS
    const violations = lintPluginCSS(plugin.slotStyles, plugin.name)
    for (const v of violations) {
      warnings.push(v.message)
    }
    // Scope plugin CSS
    const { css: scoped } = scopeCSS(plugin.slotStyles, sanitizeScopeName(plugin.name), plugin.name)
    pluginParts.push(`/* Plugin: ${plugin.name} */\n${scoped}`)
  }
  const pluginComponents = pluginParts.join('\n\n')

  // Layer 5: User overrides
  const userParts: string[] = []
  if (userStyles?.tokens && Object.keys(userStyles.tokens).length > 0) {
    userParts.push(generateUserTokenOverrides(userStyles.tokens))
  }
  if (userStyles?.global) {
    const userCSS = await loadUserGlobalCSS(userStyles.global, rootDir)
    userParts.push(userCSS)
  }
  const userOverrides = userParts.join('\n\n')

  const layers: StyleLayers = {
    base,
    themeGlobal,
    themeComponents,
    pluginComponents,
    userOverrides,
  }

  // Merge all layers in priority order
  const css = [
    `/* === Layer 1: Titan Base === */\n${base}`,
    themeGlobal ? `\n/* === Layer 2: Theme Global === */\n${themeGlobal}` : '',
    themeComponents ? `\n/* === Layer 3: Theme Components === */\n${themeComponents}` : '',
    pluginComponents ? `\n/* === Layer 4: Plugin Components === */\n${pluginComponents}` : '',
    userOverrides ? `\n/* === Layer 5: User Overrides === */\n${userOverrides}` : '',
  ].filter(Boolean).join('\n')

  return { css, layers, warnings }
}

/**
 * Sanitize a package name to a valid CSS scope prefix
 * e.g. "@titan/plugin-comments" → "titan-comments"
 */
function sanitizeScopeName(name: string): string {
  return name
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/plugin-/g, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
