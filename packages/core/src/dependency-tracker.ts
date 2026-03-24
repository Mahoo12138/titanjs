/**
 * Incremental Build - Dependency tracking for minimal rebuilds
 *
 * Tracks what each entry depends on:
 * - File content hash (self)
 * - Tag/category slugs (affect lists, prev/next)
 * - Singleton names (data dependencies)
 * - Layout name (template changes)
 *
 * On rebuild, only entries whose dependencies changed are reprocessed.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export interface EntryDependencies {
  /** Content hash of the source file */
  fileHash: string
  /** Tag slugs referenced */
  tagSlugs: string[]
  /** Category slugs referenced */
  categorySlugs: string[]
  /** Singleton names this entry depends on */
  singletonNames: string[]
  /** Layout name used for rendering */
  layoutName: string
}

export interface DependencyManifest {
  /** Entry ID → dependencies */
  entries: Record<string, EntryDependencies>
  /** Singleton name → content hash at last build */
  singletonHashes: Record<string, string>
  /** Layout name → file hash at last build */
  layoutHashes: Record<string, string>
  /** Tag slug → post count at last build */
  tagCounts: Record<string, number>
  /** Category slug → post count at last build */
  categoryCounts: Record<string, number>
}

export class DependencyTracker {
  private manifestPath: string
  private previous: DependencyManifest | null = null
  private current: DependencyManifest

  constructor(cacheDir: string) {
    this.manifestPath = path.join(cacheDir, 'deps.json')
    this.current = createEmptyManifest()
  }

  /**
   * Load previous manifest from disk
   */
  async init(): Promise<void> {
    try {
      const data = await fs.readFile(this.manifestPath, 'utf-8')
      this.previous = JSON.parse(data)
    } catch {
      this.previous = null
    }
    this.current = createEmptyManifest()
  }

  /**
   * Record dependencies for an entry
   */
  recordEntry(entryId: string, deps: EntryDependencies): void {
    this.current.entries[entryId] = deps
  }

  /**
   * Record a singleton hash
   */
  recordSingletonHash(name: string, hash: string): void {
    this.current.singletonHashes[name] = hash
  }

  /**
   * Record a layout hash
   */
  recordLayoutHash(name: string, hash: string): void {
    this.current.layoutHashes[name] = hash
  }

  /**
   * Record tag counts
   */
  recordTagCounts(counts: Record<string, number>): void {
    this.current.tagCounts = counts
  }

  /**
   * Record category counts
   */
  recordCategoryCounts(counts: Record<string, number>): void {
    this.current.categoryCounts = counts
  }

  /**
   * Check if an entry needs rebuilding based on its dependencies
   */
  needsRebuild(entryId: string, currentDeps: EntryDependencies): boolean {
    if (!this.previous) return true

    const prevDeps = this.previous.entries[entryId]
    if (!prevDeps) return true

    // 1. File content changed
    if (prevDeps.fileHash !== currentDeps.fileHash) return true

    // 2. Tag statistics changed (affects lists, prev/next)
    for (const slug of currentDeps.tagSlugs) {
      const prevCount = this.previous.tagCounts[slug]
      const currCount = this.current.tagCounts[slug]
      if (prevCount !== currCount) return true
    }

    // 3. Category statistics changed
    for (const slug of currentDeps.categorySlugs) {
      const prevCount = this.previous.categoryCounts[slug]
      const currCount = this.current.categoryCounts[slug]
      if (prevCount !== currCount) return true
    }

    // 4. Singleton data changed
    for (const name of currentDeps.singletonNames) {
      const prevHash = this.previous.singletonHashes[name]
      const currHash = this.current.singletonHashes[name]
      if (prevHash !== currHash) return true
    }

    // 5. Layout template changed
    if (currentDeps.layoutName) {
      const prevHash = this.previous.layoutHashes[currentDeps.layoutName]
      const currHash = this.current.layoutHashes[currentDeps.layoutName]
      if (prevHash !== currHash) return true
    }

    return false
  }

  /**
   * Get list of entry IDs whose dependencies changed
   */
  getChangedEntries(allDeps: Map<string, EntryDependencies>): string[] {
    const changed: string[] = []
    for (const [entryId, deps] of allDeps) {
      if (this.needsRebuild(entryId, deps)) {
        changed.push(entryId)
      }
    }
    return changed
  }

  /**
   * Persist current manifest
   */
  async save(): Promise<void> {
    const dir = path.dirname(this.manifestPath)
    await fs.mkdir(dir, { recursive: true })
    const tmpPath = `${this.manifestPath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(this.current, null, 2), 'utf-8')
    await fs.rename(tmpPath, this.manifestPath)
  }
}

function createEmptyManifest(): DependencyManifest {
  return {
    entries: {},
    singletonHashes: {},
    layoutHashes: {},
    tagCounts: {},
    categoryCounts: {},
  }
}

/**
 * Hash file content (SHA-256, 16 hex chars)
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath)
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Hash arbitrary data
 */
export function hashData(data: unknown): string {
  const json = JSON.stringify(data)
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16)
}
