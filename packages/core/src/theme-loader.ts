/**
 * Theme Loader - Discover, load, and resolve themes
 *
 * Responsibilities:
 * - Resolve theme directory from config (local path or package name)
 * - Load theme.config.ts definition
 * - Discover and load layout modules
 * - Validate theme config with Zod schema
 * - Collect and validate slot components from plugins
 * - Resolve layout for each entry (frontmatter → type map → default)
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  ThemeDefinition,
  ResolvedTheme,
  LayoutModule,
  SlotComponentDefinition,
  BaseEntry,
  PluginDefinition,
} from '@titan/types'

const DEFAULT_TYPE_LAYOUT_MAP: Record<string, string> = {
  post: 'post',
  page: 'page',
  tag: 'tag',
  category: 'category',
  archive: 'archive',
}

/**
 * Load and resolve a theme
 */
export async function loadTheme(
  themeRef: string | { name: string; config?: Record<string, unknown> } | undefined,
  rootDir: string,
  plugins: PluginDefinition[],
  userThemeConfig?: Record<string, unknown>,
  /** Custom module importer (for testing) */
  importer?: (url: string) => Promise<any>,
): Promise<ResolvedTheme | null> {
  if (!themeRef) return null

  const themeName = typeof themeRef === 'string' ? themeRef : themeRef.name
  const themeConfigOverrides = typeof themeRef === 'object' ? themeRef.config : userThemeConfig

  // Resolve theme directory
  const themeDir = await resolveThemeDir(themeName, rootDir)

  // Prefer dist/ directory if it contains a built theme
  const effectiveDir = await resolveEffectiveThemeDir(themeDir)

  // Load theme definition
  const importFn = importer ?? defaultImport
  const definition = await loadThemeDefinition(effectiveDir, importFn)

  // Validate theme config
  let resolvedConfig: Record<string, unknown> = {}
  if (definition.config && themeConfigOverrides) {
    const result = definition.config.safeParse(themeConfigOverrides)
    if (!result.success) {
      const issues = result.error.issues.map(
        (i: any) => `  - ${i.path.join('.')}: ${i.message}`,
      ).join('\n')
      throw new Error(`Theme config validation failed:\n${issues}`)
    }
    resolvedConfig = result.data
  } else if (definition.config) {
    // Use defaults from schema
    const result = definition.config.safeParse({})
    if (result.success) resolvedConfig = result.data
  }

  // Load layouts
  const layouts = await loadLayouts(effectiveDir, importFn)

  // Build type → layout map
  const typeLayoutMap: Record<string, string> = {
    ...DEFAULT_TYPE_LAYOUT_MAP,
    ...definition.typeLayoutMap,
  }

  // Add collection content types from plugins
  for (const plugin of plugins) {
    for (const col of plugin.collections ?? []) {
      if (!typeLayoutMap[col.name]) {
        typeLayoutMap[col.name] = col.layout
      }
    }
  }

  // Collect and validate slot components from plugins
  const slotComponents = collectSlotComponents(plugins, definition)

  // Load theme styles (style.css)
  const styles = await loadThemeStyles(effectiveDir)

  return {
    definition,
    config: resolvedConfig,
    layouts,
    slotComponents,
    typeLayoutMap,
    rootDir: effectiveDir,
    styles,
  }
}

/**
 * Resolve the layout name for an entry
 */
export function resolveLayout(
  entry: BaseEntry,
  theme: ResolvedTheme,
): string {
  // 1. Frontmatter explicit layout
  if (entry.frontmatter.layout && typeof entry.frontmatter.layout === 'string') {
    return entry.frontmatter.layout
  }

  // 2. Content type → layout mapping
  const mapped = theme.typeLayoutMap[entry.contentType]
  if (mapped && theme.layouts.has(mapped)) {
    return mapped
  }

  // 3. Fallback to default
  return 'default'
}

/**
 * If the theme has a dist/ directory containing a built theme config,
 * use dist/ as the effective directory. Otherwise fall back to the root.
 */
async function resolveEffectiveThemeDir(themeDir: string): Promise<string> {
  const distDir = path.join(themeDir, 'dist')
  if (!await exists(distDir)) return themeDir

  const configNames = ['theme.config.ts', 'theme.config.js', 'theme.config.mjs']
  for (const name of configNames) {
    if (await exists(path.join(distDir, name))) return distDir
  }

  return themeDir
}

/**
 * Resolve theme directory from name, using multi-strategy resolution:
 *
 * 1. Relative / absolute path  (starts with `.` or `/` or Windows drive letter)
 * 2. Local `themes/{name}/` directory under project root
 * 3. npm package — exact name   (e.g. `titan-theme-stellar`)
 * 4. npm package — convention   `titan-theme-{name}`
 * 5. npm package — scoped       `@titan/theme-{name}`
 */
async function resolveThemeDir(
  themeName: string,
  rootDir: string,
): Promise<string> {
  const tried: string[] = []

  // ── Strategy 1: explicit relative / absolute path ──
  const isPath = themeName.startsWith('.') || themeName.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(themeName) // Windows absolute path
  if (isPath) {
    const localDir = path.resolve(rootDir, themeName)
    tried.push(`path: ${localDir}`)
    if (await exists(localDir)) return localDir
    // If user gave an explicit path, don't fall through to other strategies
    throw new Error(
      `Theme path "${themeName}" resolved to "${localDir}" but the directory does not exist.`,
    )
  }

  // ── Strategy 2: local themes/ directory ──
  const themesDir = path.join(rootDir, 'themes', themeName)
  tried.push(`local: ${themesDir}`)
  if (await exists(themesDir)) return themesDir

  // ── Strategies 3-5: npm packages ──
  // Build candidate list — the exact name first, then conventional names
  const candidates = [themeName]
  // Only add convention names if the input doesn't already look like a package
  // (i.e., doesn't start with @ and doesn't already contain 'titan-theme-')
  if (!themeName.startsWith('@') && !themeName.startsWith('titan-theme-')) {
    candidates.push(`titan-theme-${themeName}`)
    candidates.push(`@titan/theme-${themeName}`)
  }

  for (const candidate of candidates) {
    const resolved = await resolveNpmPackageDir(candidate, rootDir)
    tried.push(`npm: ${candidate}`)
    if (resolved) return resolved
  }

  throw new Error(
    `Theme "${themeName}" not found. Tried:\n` +
    tried.map((t) => `  - ${t}`).join('\n') +
    '\n\nHint: install it (e.g. pnpm add titan-theme-stellar) ' +
    'or place it in the themes/ directory.',
  )
}

/**
 * Resolve a package directory from node_modules using ESM-compatible resolution.
 */
async function resolveNpmPackageDir(
  packageName: string,
  rootDir: string,
): Promise<string | null> {
  // Use createRequire for reliable package resolution from any rootDir
  const { createRequire } = await import('node:module')
  const localRequire = createRequire(path.join(rootDir, 'package.json'))
  try {
    const packageJsonPath = localRequire.resolve(`${packageName}/package.json`)
    return path.dirname(packageJsonPath)
  } catch {
    // Not installed
  }
  return null
}

/**
 * Default module importer using dynamic import.
 * For .jsx/.tsx/.ts/.mjs files, bundle with esbuild first since Node can't import them natively
 * and local imports (e.g. ".js" → ".tsx") must be resolved by esbuild.
 */
async function defaultImport(filePath: string): Promise<any> {
  const ext = path.extname(filePath)
  if (['.jsx', '.tsx', '.ts', '.mjs'].includes(ext)) {
    const { build } = await import('esbuild')
    const { unlink } = await import('node:fs/promises')
    const tmpFile = filePath + '.tmp.mjs'
    try {
      await build({
        entryPoints: [filePath],
        outfile: tmpFile,
        bundle: true,
        format: 'esm',
        jsx: 'automatic',
        jsxImportSource: 'preact',
        target: 'es2022',
        // Keep node_modules as external; only bundle local source files
        packages: 'external',
      })
      // Bust import cache with query string
      const url = pathToFileURL(tmpFile).href + '?t=' + Date.now()
      return await import(url)
    } finally {
      await unlink(tmpFile).catch(() => {})
    }
  }
  const url = pathToFileURL(filePath).href
  return import(url)
}

/**
 * Load theme.config.ts / theme.config.js
 */
async function loadThemeDefinition(
  themeDir: string,
  importFn: (path: string) => Promise<any>,
): Promise<ThemeDefinition> {
  const configNames = ['theme.config.ts', 'theme.config.js', 'theme.config.mjs']

  for (const name of configNames) {
    const configPath = path.join(themeDir, name)
    if (await exists(configPath)) {
      const mod = await importFn(configPath)
      return mod.default ?? mod
    }
  }

  // No config file → return bare definition
  return {
    name: path.basename(themeDir),
  }
}

/**
 * Discover and load all layout modules from themes/layouts/
 */
async function loadLayouts(
  themeDir: string,
  importFn: (path: string) => Promise<any>,
): Promise<Map<string, LayoutModule>> {
  const layouts = new Map<string, LayoutModule>()
  const layoutDir = path.join(themeDir, 'layouts')

  if (!await exists(layoutDir)) return layouts

  const entries = await fs.readdir(layoutDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name)
    if (!['.tsx', '.jsx', '.js', '.mjs'].includes(ext)) continue

    const name = path.basename(entry.name, ext)
    const filePath = path.join(layoutDir, entry.name)
    const mod = await importFn(filePath)

    layouts.set(name, { default: mod.default })
  }

  return layouts
}

/**
 * Load theme styles from style.css
 */
async function loadThemeStyles(themeDir: string): Promise<string | undefined> {
  const styleNames = ['style.css', 'styles.css', 'index.css']
  for (const name of styleNames) {
    const stylePath = path.join(themeDir, name)
    if (await exists(stylePath)) {
      return fs.readFile(stylePath, 'utf-8')
    }
  }
  return undefined
}

/**
 * Collect slot components from all plugins, validate they target valid slots,
 * group by slot name, sort by order
 */
function collectSlotComponents(
  plugins: PluginDefinition[],
  definition: ThemeDefinition,
): Map<string, SlotComponentDefinition[]> {
  const grouped = new Map<string, SlotComponentDefinition[]>()
  const declaredSlots = new Set(Object.keys(definition.slots ?? {}))

  for (const plugin of plugins) {
    for (const sc of plugin.slotComponents ?? []) {
      // Validate slot exists in theme
      if (declaredSlots.size > 0 && !declaredSlots.has(sc.slot)) {
        const available = Array.from(declaredSlots).join(', ')
        throw new Error(
          `Slot mismatch: Plugin "${plugin.name}" targets slot "${sc.slot}" ` +
          `which is not declared by theme "${definition.name}".\n` +
          `Available slots: ${available || '(none)'}`,
        )
      }

      if (!grouped.has(sc.slot)) grouped.set(sc.slot, [])
      grouped.get(sc.slot)!.push(sc)
    }
  }

  // Sort each slot's components by order
  for (const [, components] of grouped) {
    components.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  return grouped
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
