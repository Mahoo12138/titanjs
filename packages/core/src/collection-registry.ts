/**
 * Collection Registry - Manages custom content type collections
 *
 * Handles:
 * - Registering collection definitions from plugins
 * - Loading source files matching collection globs
 * - Validating frontmatter with Zod schemas
 * - Generating routes per collection config
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type {
  CollectionDefinition,
  BaseEntry,
  LoadContext,
  Route,
  Collection,
} from '@titan/types'

export class CollectionRegistry {
  private definitions = new Map<string, CollectionDefinition>()

  /**
   * Register a collection definition
   */
  register(def: CollectionDefinition): void {
    if (this.definitions.has(def.name)) {
      throw new Error(`Collection "${def.name}" is already registered`)
    }
    this.definitions.set(def.name, def)
  }

  /**
   * Get all registered definitions
   */
  getAll(): CollectionDefinition[] {
    return Array.from(this.definitions.values())
  }

  /**
   * Get a specific definition
   */
  get(name: string): CollectionDefinition | undefined {
    return this.definitions.get(name)
  }

  /**
   * Check if a collection is registered
   */
  has(name: string): boolean {
    return this.definitions.has(name)
  }

  /**
   * Load source files for a collection
   */
  async loadFiles(name: string, rootDir: string): Promise<LoadContext[]> {
    const def = this.definitions.get(name)
    if (!def) throw new Error(`Unknown collection: "${name}"`)

    const sources = Array.isArray(def.source) ? def.source : [def.source]
    const contexts: LoadContext[] = []

    for (const glob of sources) {
      const files = await resolveGlob(glob, rootDir)
      for (const filePath of files) {
        const ctx = await loadAndValidate(filePath, name, def)
        contexts.push(ctx)
      }
    }

    return contexts
  }

  /**
   * Generate routes for a collection's entries
   */
  generateRoutes(name: string, entries: BaseEntry[]): Route[] {
    const def = this.definitions.get(name)
    if (!def) throw new Error(`Unknown collection: "${name}"`)

    const routes: Route[] = []

    // Item routes
    for (const entry of entries) {
      routes.push({
        path: def.routes.item,
        url: def.routes.item.replace(':slug', entry.slug),
        contentType: name,
        slug: entry.slug,
        layout: def.layout,
        outputPath: `${def.routes.item.replace(':slug', entry.slug).replace(/^\//, '')}/index.html`,
        type: 'item',
      })
    }

    // List route
    if (def.routes.list) {
      routes.push({
        path: def.routes.list,
        url: def.routes.list.endsWith('/') ? def.routes.list : `${def.routes.list}/`,
        contentType: name,
        layout: def.layout,
        outputPath: `${def.routes.list.replace(/^\//, '')}/index.html`,
        type: 'list',
      })
    }

    // Paginated routes
    if (def.routes.paginate) {
      const { size, path: pagePath } = def.routes.paginate
      const totalPages = Math.ceil(entries.length / size)

      for (let page = 1; page <= totalPages; page++) {
        const url = pagePath.replace(':n', String(page))
        routes.push({
          path: pagePath,
          url,
          contentType: name,
          layout: def.layout,
          outputPath: `${url.replace(/^\//, '')}/index.html`,
          type: 'paginated',
          pagination: {
            current: page,
            total: totalPages,
            size,
            prev: page > 1 ? pagePath.replace(':n', String(page - 1)) : null,
            next: page < totalPages ? pagePath.replace(':n', String(page + 1)) : null,
          },
        })
      }
    }

    return routes
  }
}

/**
 * Load a file and validate frontmatter against the collection schema
 */
async function loadAndValidate(
  filePath: string,
  contentType: string,
  def: CollectionDefinition,
): Promise<LoadContext> {
  const rawContent = await fs.readFile(filePath, 'utf-8')
  const { data: frontmatter, content: body } = matter(rawContent)

  // Validate with Zod schema
  const result = def.schema.safeParse(frontmatter)
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`,
    ).join('\n')
    throw new Error(
      `Validation failed for ${filePath} (collection: ${contentType}):\n${issues}`,
    )
  }

  return {
    filePath,
    rawContent,
    frontmatter: result.data as Record<string, unknown>,
    contentType,
    body,
  }
}

/**
 * Resolve glob patterns to file paths
 * Uses simple recursive scanning with glob matching
 */
async function resolveGlob(pattern: string, rootDir: string): Promise<string[]> {
  // Convert glob to a directory + extension filter
  // Supports patterns like: source/_notes/**/*.md
  const parts = pattern.split('/')
  let baseDir = rootDir
  const globParts: string[] = []

  for (const part of parts) {
    if (part.includes('*') || part.includes('?') || part.includes('[')) {
      globParts.push(part)
    } else if (globParts.length === 0) {
      baseDir = path.join(baseDir, part)
    } else {
      globParts.push(part)
    }
  }

  if (globParts.length === 0) {
    // No glob => treat as direct file path
    const filePath = path.join(rootDir, pattern)
    try {
      await fs.access(filePath)
      return [filePath]
    } catch {
      return []
    }
  }

  // Build a regex from remaining glob parts
  const globRegex = globPartsToRegex(globParts.join('/'))

  return scanDir(baseDir, baseDir, globRegex)
}

/**
 * Recursively scan directory and filter by regex
 */
async function scanDir(
  dir: string,
  baseDir: string,
  regex: RegExp,
): Promise<string[]> {
  const results: string[] = []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(baseDir, fullPath)

      if (entry.isDirectory()) {
        const nested = await scanDir(fullPath, baseDir, regex)
        results.push(...nested)
      } else if (entry.isFile() && regex.test(relativePath)) {
        results.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return results.sort()
}

/**
 * Convert a simple glob pattern to a regex
 * Supports: * (any non-slash), ** (any path), ? (single char)
 */
function globPartsToRegex(glob: string): RegExp {
  let regex = ''
  let i = 0

  while (i < glob.length) {
    const char = glob[i]

    if (char === '*' && glob[i + 1] === '*') {
      // ** matches any path segment(s)
      regex += '.*'
      i += 2
      if (glob[i] === '/') i++ // skip trailing slash
    } else if (char === '*') {
      // * matches anything except /
      regex += '[^/]*'
      i++
    } else if (char === '?') {
      regex += '[^/]'
      i++
    } else if (char === '.') {
      regex += '\\.'
      i++
    } else {
      regex += char
      i++
    }
  }

  return new RegExp(`^${regex}$`)
}
