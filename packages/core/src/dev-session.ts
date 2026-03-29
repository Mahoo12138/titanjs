/**
 * DevSession - Development-mode session for on-demand page compilation & HMR
 *
 * Holds the content index, route mapping, dependency graph, theme instance,
 * and provides the dev-specific API:
 *
 *  - init()                  Lightweight index build (no full HTML emit)
 *  - renderOnDemand(url)     First-access page compilation (returns HTML)
 *  - handleFileChange(path)  Markdown/config change → re-transform + cascade
 *  - collectAffectedRoutes() Compute which routes need refresh after a change
 *  - getRouteForUrl(url)     URL → Route lookup
 */
import path from 'node:path'
import type {
  TitanConfig,
  BaseEntry,
  Route,
  SiteData,
  ResolvedTheme,
} from '@titan/types'
import { Engine } from './engine.js'
import { loadFile } from './loader.js'
import {
  buildRouteDependencyIndex,
  collectAffectedRoutes,
  type RouteDependencyIndex,
} from './dependency-tracker.js'

export interface DevSessionOptions {
  rootDir: string
  config: TitanConfig
  /** Enable debug logging to console */
  debug?: boolean
}

export interface FileChangeResult {
  /** Entry ID of the changed file (if it maps to an entry) */
  entryId: string | null
  /** Whether frontmatter changed (triggers cascade) */
  frontmatterChanged: boolean
  /** Route URLs that need to be refreshed */
  affectedRoutes: string[]
  /** Time taken in ms */
  elapsed: number
}

/** Cumulative stats exposed for observability */
export interface DevSessionStats {
  /** Total pages rendered */
  renderCount: number
  /** Cache hits */
  cacheHits: number
  /** Cache misses (first-visit compiles) */
  cacheMisses: number
  /** Total file change events handled */
  fileChangeCount: number
  /** Total full re-index events */
  fullReindexCount: number
  /** Total routes invalidated across all file changes */
  routesInvalidated: number
}

export class DevSession {
  readonly engine: Engine

  // Mutable state held across the session
  private entries: BaseEntry[] = []
  private singletonData: Map<string, unknown> = new Map()
  private siteData: SiteData | null = null
  private routes: Route[] = []
  private theme: ResolvedTheme | null = null
  private routeIndex: RouteDependencyIndex | null = null

  // URL → Route lookup
  private urlToRoute: Map<string, Route> = new Map()

  // File path → entry ID (built from LoadContexts)
  private fileToEntryId: Map<string, string> = new Map()

  // Route URL → rendered HTML cache (invalidated per-route)
  private renderCache: Map<string, string> = new Map()

  // Observability
  private debug: boolean
  private _stats: DevSessionStats = {
    renderCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    fileChangeCount: 0,
    fullReindexCount: 0,
    routesInvalidated: 0,
  }

  private initialized = false

  constructor(options: DevSessionOptions) {
    this.debug = options.debug ?? false
    this.engine = new Engine({
      rootDir: options.rootDir,
      config: options.config,
      noCache: true, // dev session manages its own in-memory cache
    })
  }

  /**
   * Get cumulative stats for observability
   */
  get stats(): Readonly<DevSessionStats> {
    return this._stats
  }

  /**
   * Get cache hit rate (0-1). Returns 0 if no renders yet.
   */
  get cacheHitRate(): number {
    const total = this._stats.cacheHits + this._stats.cacheMisses
    return total === 0 ? 0 : this._stats.cacheHits / total
  }

  /**
   * Initialize: engine setup + lightweight index build (load + transform + generate).
   * Does NOT emit HTML to disk — pages are rendered on first access.
   */
  async init(): Promise<{ entries: number; routes: number; elapsed: number }> {
    const startTime = Date.now()

    await this.engine.init()

    // Load all source files
    const { loadContexts, singletonData } = await this.engine.loadAll()
    this.singletonData = singletonData

    // Transform all entries
    const { entries } = await this.engine.transformAll(loadContexts)
    this.entries = entries

    // Build file → entry mapping from loadContexts
    this.fileToEntryId.clear()
    for (const ctx of loadContexts) {
      // Derive slug the same way transformer does (filename without date prefix)
      const entry = entries.find(e => {
        // Match by comparing the slug with the filename
        const basename = ctx.filePath.split('/').pop()?.replace(/\.md$/, '') ?? ''
        const slugFromFile = basename.replace(/^\d{4}-\d{2}-\d{2}-/, '')
        return e.slug === slugFromFile || e.id === slugFromFile
      })
      if (entry) {
        this.fileToEntryId.set(ctx.filePath, entry.id)
      }
    }

    // Generate routes
    const { siteData, routes } = await this.engine.generate(entries, singletonData)
    this.siteData = siteData
    this.routes = routes

    // Resolve theme (once; reused for all renders)
    const { theme } = await this.engine.resolveTheme()
    this.theme = theme

    // Build route index for HMR cascade detection
    this.rebuildRouteIndex()

    this.initialized = true
    const elapsed = Date.now() - startTime

    this.logDebug(`init: ${entries.length} entries, ${routes.length} routes (${elapsed}ms)`)

    return { entries: entries.length, routes: routes.length, elapsed }
  }

  /**
   * Look up a Route by URL path (e.g. '/posts/hello-world/')
   */
  getRouteForUrl(url: string): Route | undefined {
    return this.urlToRoute.get(url)
  }

  /**
   * Get all routes
   */
  getRoutes(): Route[] {
    return this.routes
  }

  /**
   * Render a page on demand. Returns HTML string or null if no matching route.
   * Results are cached until invalidated by handleFileChange.
   */
  async renderOnDemand(url: string): Promise<string | null> {
    // Check cache
    const cached = this.renderCache.get(url)
    if (cached) {
      this._stats.renderCount++
      this._stats.cacheHits++
      this.logDebug(`cache hit: ${url}`)
      return cached
    }

    const route = this.urlToRoute.get(url)
    if (!route || !this.siteData) return null

    const startTime = Date.now()
    const html = await this.engine.renderRoute(route, this.siteData, this.theme)

    this._stats.renderCount++
    this._stats.cacheMisses++

    if (html) {
      this.renderCache.set(url, html)
    }

    this.logDebug(`compiled: ${url} (${Date.now() - startTime}ms)`)

    return html
  }

  /**
   * Handle a source file change (Markdown edit).
   * Re-loads and re-transforms the file, then computes affected routes.
   */
  async handleFileChange(filePath: string): Promise<FileChangeResult> {
    const startTime = Date.now()
    this._stats.fileChangeCount++

    // Find which entry this file belongs to
    const trackedEntryId = this.fileToEntryId.get(filePath) ?? null

    if (!trackedEntryId) {
      // Unknown file — might be a new file; do a full re-index
      return this.fullReindex(startTime)
    }

    const previousIndex = this.routeIndex

    // Snapshot old frontmatter for diff
    const oldEntry = this.entries.find(e => e.id === trackedEntryId) as any
    const oldTagSlugs = (oldEntry?.tags ?? []).map((t: any) => t.slug)
    const oldCatSlugs = (oldEntry?.categories ?? []).map((c: any) => c.slug)

    // Determine content type of existing entry
    const contentType = oldEntry?.contentType ?? 'post'

    // Re-load and re-transform the single file
    const loadCtx = await loadFile(filePath, contentType)
    const newEntry = await this.engine.transformSingle(loadCtx)
    const nextEntryId = newEntry.id

    // Replace in entries array
    const idx = this.entries.findIndex(e => e.id === trackedEntryId)
    if (idx >= 0) {
      this.entries[idx] = newEntry
    }
    this.fileToEntryId.set(filePath, nextEntryId)

    // Detect frontmatter changes
    const newTagSlugs = ((newEntry as any).tags ?? []).map((t: any) => t.slug)
    const newCatSlugs = ((newEntry as any).categories ?? []).map((c: any) => c.slug)
    const frontmatterChanged = detectFrontmatterChange(oldEntry, newEntry)

    // Re-generate site data and routes
    const { siteData, routes } = await this.engine.generate(this.entries, this.singletonData)
    this.siteData = siteData
    this.routes = routes
    this.rebuildRouteIndex()

    // Compute affected routes
    const affected = collectAffectedRoutes(
      trackedEntryId,
      this.routeIndex!,
      frontmatterChanged,
      oldTagSlugs,
      newTagSlugs,
      oldCatSlugs,
      newCatSlugs,
      previousIndex,
      nextEntryId,
    )

    // Invalidate render cache for affected routes
    for (const url of affected) {
      this.renderCache.delete(url)
    }

    const elapsed = Date.now() - startTime
    this._stats.routesInvalidated += affected.size

    this.logDebug(
      `${frontmatterChanged ? 'frontmatter' : 'body'} change: ${path.relative(this.engine.rootDir, filePath)} -> ${affected.size} route(s) (${elapsed}ms, cache ${Math.round(this.cacheHitRate * 100)}%)`,
    )

    return {
      entryId: nextEntryId,
      frontmatterChanged,
      affectedRoutes: [...affected],
      elapsed,
    }
  }

  /**
   * Full re-index (for new/deleted files or unknown changes)
   */
  private async fullReindex(startTime: number): Promise<FileChangeResult> {
    this._stats.fullReindexCount++

    const { loadContexts, singletonData } = await this.engine.loadAll()
    this.singletonData = singletonData
    const { entries } = await this.engine.transformAll(loadContexts)
    this.entries = entries

    // Rebuild file → entry mapping
    this.fileToEntryId.clear()
    for (const ctx of loadContexts) {
      const entry = entries.find(e => {
        const basename = ctx.filePath.split('/').pop()?.replace(/\.md$/, '') ?? ''
        const slugFromFile = basename.replace(/^\d{4}-\d{2}-\d{2}-/, '')
        return e.slug === slugFromFile || e.id === slugFromFile
      })
      if (entry) {
        this.fileToEntryId.set(ctx.filePath, entry.id)
      }
    }

    const { siteData, routes } = await this.engine.generate(entries, singletonData)
    this.siteData = siteData
    this.routes = routes
    this.rebuildRouteIndex()

    // Invalidate entire render cache
    this.renderCache.clear()

    const elapsed = Date.now() - startTime
    this._stats.routesInvalidated += this.routes.length
    this.logDebug(`full re-index: ${this.routes.length} routes (${elapsed}ms)`)

    return {
      entryId: null,
      frontmatterChanged: true,
      affectedRoutes: this.routes.map(r => r.url),
      elapsed,
    }
  }

  /**
   * Rebuild the URL lookup map and route dependency index
   */
  private rebuildRouteIndex(): void {
    this.urlToRoute.clear()
    for (const route of this.routes) {
      this.urlToRoute.set(route.url, route)
    }

    // Build route dependency index using entries with file paths
    const entriesWithMeta = this.entries.map(e => ({
      id: e.id,
      slug: e.slug,
      contentType: e.contentType,
      filePath: (e as any).filePath ?? undefined,
      tags: (e as any).tags,
      categories: (e as any).categories,
      date: (e as any).date,
    }))
    this.routeIndex = buildRouteDependencyIndex(this.routes, entriesWithMeta)
  }

  private logDebug(message: string): void {
    if (this.debug) {
      console.log(`[titan:dev] ${message}`)
    }
  }
}

/**
 * Detect if frontmatter-level fields changed between old and new entries
 */
function detectFrontmatterChange(
  oldEntry: BaseEntry | null,
  newEntry: BaseEntry,
): boolean {
  if (!oldEntry) return true

  const frontmatterKeys = ['title', 'date', 'tags', 'categories', 'layout', 'slug'] as const
  for (const key of frontmatterKeys) {
    const oldVal = normalizeFrontmatterValue(oldEntry, key)
    const newVal = normalizeFrontmatterValue(newEntry, key)
    if (oldVal !== newVal) return true
  }
  return false
}

function normalizeFrontmatterValue(
  entry: BaseEntry,
  key: 'title' | 'date' | 'tags' | 'categories' | 'layout' | 'slug',
): string {
  switch (key) {
    case 'date': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (entry as any).date
      if (!value) return 'null'
      const date = value instanceof Date ? value : new Date(String(value))
      return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
    }
    case 'tags':
    case 'categories': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = ((entry as any)[key] ?? []) as Array<string | { slug?: string }>
      return JSON.stringify(values.map(value => typeof value === 'string' ? value : value.slug ?? '').sort())
    }
    default:
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return JSON.stringify((entry as any)[key] ?? null)
  }
}
