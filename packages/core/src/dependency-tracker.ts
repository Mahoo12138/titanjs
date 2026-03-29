/**
 * Incremental Build - Dependency tracking for minimal rebuilds
 *
 * Tracks what each entry depends on:
 * - File content hash (self)
 * - Tag/category slugs (affect lists, prev/next)
 * - Singleton names (data dependencies)
 * - Layout name (template changes)
 *
 * Dev Server additions:
 * - Route-level dependency tracking (entry → routes, route → entries)
 * - Tag/category reverse index for cascade detection
 * - collectAffectedRoutes() for precise HMR
 *
 * On rebuild, only entries whose dependencies changed are reprocessed.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { Route } from '@titan/types'

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

/**
 * Route dependency index for dev-mode HMR propagation.
 * Maps between entries, routes, tags, and categories.
 */
export interface RouteDependencyIndex {
  /** Entry ID → item route URLs owned by this entry */
  entryToRoutes: Map<string, Set<string>>
  /** Route URL → entry IDs that appear on this route */
  routeToEntries: Map<string, Set<string>>
  /** Tag slug → route URLs for that tag's listing */
  tagToRoutes: Map<string, Set<string>>
  /** Category slug → route URLs for that category's listing */
  categoryToRoutes: Map<string, Set<string>>
  /** Tag index routes (for example /tags/) */
  tagIndexRoutes: Set<string>
  /** Category index routes (for example /categories/) */
  categoryIndexRoutes: Set<string>
  /** Entry ID → adjacent post item routes affected by prev/next changes */
  entryToNeighborRoutes: Map<string, Set<string>>
  /** Entry file path → entry ID */
  fileToEntry: Map<string, string>
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

/**
 * Build a route dependency index from routes and entries.
 * Used by DevSession for precise HMR cascade detection.
 */
export function buildRouteDependencyIndex(
  routes: Route[],
  entries: Array<{
    id: string
    slug: string
    contentType: string
    filePath?: string
    tags?: Array<{ slug: string }>
    categories?: Array<{ slug: string }>
    date?: Date
  }>,
): RouteDependencyIndex {
  const index: RouteDependencyIndex = {
    entryToRoutes: new Map(),
    routeToEntries: new Map(),
    tagToRoutes: new Map(),
    categoryToRoutes: new Map(),
    tagIndexRoutes: new Set(),
    categoryIndexRoutes: new Set(),
    entryToNeighborRoutes: new Map(),
    fileToEntry: new Map(),
  }
  const postItemRoutes = new Map<string, string>()

  // Build file → entry map
  for (const entry of entries) {
    if (entry.filePath) {
      index.fileToEntry.set(entry.filePath, entry.id)
    }
  }

  // Map entries to routes
  for (const route of routes) {
    const url = route.url

    if (route.type === 'item' && route.slug) {
      // Item route: directly tied to one entry only.
      addMapping(index.entryToRoutes, route.slug, url)
      addMapping(index.routeToEntries, url, route.slug)
      if (route.contentType === 'post') {
        postItemRoutes.set(route.slug, url)
      }
    }

    if (route.type === 'list') {
      if (route.contentType === 'tag' && route.data?.tag) {
        const tagSlug = (route.data.tag as any).slug
        if (tagSlug) {
          addMapping(index.tagToRoutes, tagSlug, url)
          // All entries with this tag appear on this route
          for (const entry of entries) {
            if (entry.tags?.some(t => t.slug === tagSlug)) {
              addMapping(index.routeToEntries, url, entry.id)
            }
          }
        }
      } else if (route.contentType === 'tag') {
        index.tagIndexRoutes.add(url)
      }

      if (route.contentType === 'category' && route.data?.category) {
        const catSlug = (route.data.category as any).slug
        if (catSlug) {
          addMapping(index.categoryToRoutes, catSlug, url)
          for (const entry of entries) {
            if (entry.categories?.some(c => c.slug === catSlug)) {
              addMapping(index.routeToEntries, url, entry.id)
            }
          }
        }
      } else if (route.contentType === 'category') {
        index.categoryIndexRoutes.add(url)
      }

      // Index / archive / generic list routes show all posts
      if (route.url === '/' || route.layout === 'archive') {
        for (const entry of entries) {
          if (entry.contentType === 'post') {
            addMapping(index.routeToEntries, url, entry.id)
          }
        }
      }
    }
  }

  const posts = (entries.filter(
    entry => entry.contentType === 'post' && entry.date instanceof Date,
  ) as Array<(typeof entries)[number] & { date: Date }>)
    .sort((a, b) => b.date.getTime() - a.date.getTime())

  for (let i = 0; i < posts.length; i++) {
    const previous = posts[i - 1]
    const next = posts[i + 1]

    if (previous) {
      const previousRoute = postItemRoutes.get(previous.slug)
      if (previousRoute) {
        addMapping(index.entryToNeighborRoutes, posts[i].id, previousRoute)
      }
    }

    if (next) {
      const nextRoute = postItemRoutes.get(next.slug)
      if (nextRoute) {
        addMapping(index.entryToNeighborRoutes, posts[i].id, nextRoute)
      }
    }
  }

  return index
}

/**
 * Given a changed entry and its old/new frontmatter, compute
 * the set of route URLs that need to be refreshed.
 */
export function collectAffectedRoutes(
  entryId: string,
  index: RouteDependencyIndex,
  frontmatterChanged: boolean,
  oldTagSlugs?: string[],
  newTagSlugs?: string[],
  oldCatSlugs?: string[],
  newCatSlugs?: string[],
  previousIndex?: RouteDependencyIndex | null,
  nextEntryId?: string,
): Set<string> {
  const affected = new Set<string>()
  const currentEntryId = nextEntryId ?? entryId

  // The entry's own route(s) are always affected.
  addSetValues(affected, index.entryToRoutes.get(currentEntryId))
  addSetValues(affected, previousIndex?.entryToRoutes.get(entryId))

  if (frontmatterChanged) {
    addEntryMembershipRoutes(affected, index, currentEntryId)
    addSetValues(affected, index.entryToNeighborRoutes.get(currentEntryId))

    if (previousIndex) {
      addEntryMembershipRoutes(affected, previousIndex, entryId)
      addSetValues(affected, previousIndex.entryToNeighborRoutes.get(entryId))
    }

    // Tag changes: routes for old and new tags
    const allTagSlugs = new Set([...(oldTagSlugs ?? []), ...(newTagSlugs ?? [])])
    if (allTagSlugs.size > 0) {
      addSetValues(affected, index.tagIndexRoutes)
      addSetValues(affected, previousIndex?.tagIndexRoutes)
    }
    for (const slug of allTagSlugs) {
      addSetValues(affected, index.tagToRoutes.get(slug))
      addSetValues(affected, previousIndex?.tagToRoutes.get(slug))
    }

    // Category changes: routes for old and new categories
    const allCatSlugs = new Set([...(oldCatSlugs ?? []), ...(newCatSlugs ?? [])])
    if (allCatSlugs.size > 0) {
      addSetValues(affected, index.categoryIndexRoutes)
      addSetValues(affected, previousIndex?.categoryIndexRoutes)
    }
    for (const slug of allCatSlugs) {
      addSetValues(affected, index.categoryToRoutes.get(slug))
      addSetValues(affected, previousIndex?.categoryToRoutes.get(slug))
    }
  }

  return affected
}

function addEntryMembershipRoutes(
  affected: Set<string>,
  index: RouteDependencyIndex,
  entryId: string,
): void {
  for (const [url, entryIds] of index.routeToEntries) {
    if (entryIds.has(entryId)) {
      affected.add(url)
    }
  }
}

function addSetValues(target: Set<string>, values?: Iterable<string>): void {
  if (!values) return
  for (const value of values) {
    target.add(value)
  }
}

function addMapping(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key)
  if (!set) {
    set = new Set()
    map.set(key, set)
  }
  set.add(value)
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
