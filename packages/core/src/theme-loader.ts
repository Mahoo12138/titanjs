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
  if (!themeDir) {
    throw new Error(`Theme "${themeName}" not found. Looked for local directory and node_modules package.`)
  }

  // Load theme definition
  const importFn = importer ?? defaultImport
  const definition = await loadThemeDefinition(themeDir, importFn)

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
  const layouts = await loadLayouts(themeDir, importFn)

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
  const styles = await loadThemeStyles(themeDir)

  return {
    definition,
    config: resolvedConfig,
    layouts,
    slotComponents,
    typeLayoutMap,
    rootDir: themeDir,
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
 * Resolve theme directory from name
 */
async function resolveThemeDir(
  themeName: string,
  rootDir: string,
): Promise<string | null> {
  // Try local directory first (e.g. "./themes/my-theme")
  if (themeName.startsWith('.') || themeName.startsWith('/')) {
    const localDir = path.resolve(rootDir, themeName)
    if (await exists(localDir)) return localDir
    return null
  }

  // Try themes/ subdirectory
  const themesDir = path.join(rootDir, 'themes', themeName)
  if (await exists(themesDir)) return themesDir

  // Try node_modules (package name like @titan/theme-default)
  try {
    const packageJsonPath = require.resolve(`${themeName}/package.json`, {
      paths: [rootDir],
    })
    return path.dirname(packageJsonPath)
  } catch {
    // Not found in node_modules
  }

  return null
}

/**
 * Default module importer using dynamic import.
 * For .jsx/.tsx/.ts files, transpile with esbuild first since Node can't import them natively.
 */
async function defaultImport(filePath: string): Promise<any> {
  const ext = path.extname(filePath)
  if (['.jsx', '.tsx', '.ts'].includes(ext)) {
    const { transform } = await import('esbuild')
    const { readFile, writeFile, unlink } = await import('node:fs/promises')
    const source = await readFile(filePath, 'utf-8')
    const result = await transform(source, {
      loader: ext.slice(1) as 'jsx' | 'tsx' | 'ts',
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'preact',
      target: 'es2022',
      sourcefile: filePath,
    })
    // Write transpiled code next to the original file as .tmp.mjs
    const tmpFile = filePath + '.tmp.mjs'
    await writeFile(tmpFile, result.code, 'utf-8')
    try {
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
