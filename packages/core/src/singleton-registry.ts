/**
 * Singleton Registry - Manages globally unique data sources
 *
 * Supports three source types:
 * 1. Markdown file (frontmatter data)
 * 2. JSON file
 * 3. Async function (fetched at build time)
 *
 * Features:
 * - Zod schema validation
 * - Persistent cache with TTL for async sources
 * - Fallback values when async sources fail
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type { SingletonDefinition } from '@titan/types'

interface CachedSingleton {
  data: unknown
  timestamp: number
}

export class SingletonRegistry {
  private definitions = new Map<string, SingletonDefinition>()
  private resolved = new Map<string, unknown>()
  private cacheDir: string | null = null

  /**
   * Register a singleton definition
   */
  register(def: SingletonDefinition): void {
    if (this.definitions.has(def.name)) {
      throw new Error(`Singleton "${def.name}" is already registered`)
    }
    this.definitions.set(def.name, def)
  }

  /**
   * Set the cache directory for persistent singletons
   */
  setCacheDir(dir: string): void {
    this.cacheDir = dir
  }

  /**
   * Get all registered definitions
   */
  getAll(): SingletonDefinition[] {
    return Array.from(this.definitions.values())
  }

  /**
   * Check if a singleton is registered
   */
  has(name: string): boolean {
    return this.definitions.has(name)
  }

  /**
   * Resolve a singleton's data
   */
  async resolve(name: string, rootDir: string): Promise<unknown> {
    // Check if already resolved in this build
    if (this.resolved.has(name)) {
      return this.resolved.get(name)
    }

    const def = this.definitions.get(name)
    if (!def) throw new Error(`Unknown singleton: "${name}"`)

    const data = await this.loadSource(def, rootDir)
    this.resolved.set(name, data)
    return data
  }

  /**
   * Resolve all singletons
   */
  async resolveAll(rootDir: string): Promise<Map<string, unknown>> {
    for (const [name] of this.definitions) {
      await this.resolve(name, rootDir)
    }
    return new Map(this.resolved)
  }

  /**
   * Get previously resolved singleton data
   */
  get(name: string): unknown | undefined {
    return this.resolved.get(name)
  }

  /**
   * Clear resolved data (for rebuilds)
   */
  clearResolved(): void {
    this.resolved.clear()
  }

  /**
   * Load data from the singleton source
   */
  private async loadSource(
    def: SingletonDefinition,
    rootDir: string,
  ): Promise<unknown> {
    if (typeof def.source === 'function') {
      return this.loadAsyncSource(def)
    }

    return this.loadFileSource(def, rootDir)
  }

  /**
   * Load from a file source (Markdown or JSON)
   */
  private async loadFileSource(
    def: SingletonDefinition,
    rootDir: string,
  ): Promise<unknown> {
    const filePath = path.resolve(rootDir, def.source as string)
    const ext = path.extname(filePath)

    let rawData: unknown

    if (ext === '.md') {
      const content = await fs.readFile(filePath, 'utf-8')
      const { data: frontmatter, content: body } = matter(content)
      rawData = { ...frontmatter, content: body }
    } else if (ext === '.json') {
      const content = await fs.readFile(filePath, 'utf-8')
      rawData = JSON.parse(content)
    } else {
      throw new Error(
        `Unsupported file type "${ext}" for singleton "${def.name}". Use .md or .json`,
      )
    }

    // Validate with schema
    const result = def.schema.safeParse(rawData)
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')
      throw new Error(
        `Singleton "${def.name}" validation failed:\n${issues}`,
      )
    }

    return result.data
  }

  /**
   * Load from an async function source with optional persistent cache
   */
  private async loadAsyncSource(def: SingletonDefinition): Promise<unknown> {
    const sourceFn = def.source as () => Promise<unknown>

    // Check persistent cache
    if (def.cache === 'persistent' && this.cacheDir) {
      const cached = await this.readPersistentCache(def.name)
      if (cached && def.cacheTTL) {
        const age = Date.now() - cached.timestamp
        if (age < def.cacheTTL) {
          // Validate cached data
          const result = def.schema.safeParse(cached.data)
          if (result.success) return result.data
        }
      }
    }

    try {
      const rawData = await sourceFn()

      // Validate
      const result = def.schema.safeParse(rawData)
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')
        throw new Error(
          `Singleton "${def.name}" validation failed:\n${issues}`,
        )
      }

      // Write to persistent cache
      if (def.cache === 'persistent' && this.cacheDir) {
        await this.writePersistentCache(def.name, result.data)
      }

      return result.data
    } catch (error) {
      // Use fallback if available
      if (def.fallback !== undefined) {
        return def.fallback
      }
      throw error
    }
  }

  /**
   * Read from persistent cache file
   */
  private async readPersistentCache(name: string): Promise<CachedSingleton | null> {
    if (!this.cacheDir) return null

    try {
      const cachePath = path.join(this.cacheDir, 'singletons', `${name}.json`)
      const content = await fs.readFile(cachePath, 'utf-8')
      return JSON.parse(content) as CachedSingleton
    } catch {
      return null
    }
  }

  /**
   * Write to persistent cache file (atomic)
   */
  private async writePersistentCache(name: string, data: unknown): Promise<void> {
    if (!this.cacheDir) return

    const dir = path.join(this.cacheDir, 'singletons')
    await fs.mkdir(dir, { recursive: true })

    const cachePath = path.join(dir, `${name}.json`)
    const tmpPath = `${cachePath}.tmp`
    const cached: CachedSingleton = { data, timestamp: Date.now() }

    await fs.writeFile(tmpPath, JSON.stringify(cached), 'utf-8')
    await fs.rename(tmpPath, cachePath)
  }
}
