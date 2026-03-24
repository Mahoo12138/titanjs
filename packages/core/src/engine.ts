/**
 * Engine - Orchestrates the four-stage pipeline
 *
 * Load → Transform → Generate → Emit
 *
 * Phase 2 additions:
 * - Collection registry for custom content types
 * - Singleton registry for global data
 * - IoC container + DAG scheduling for plugin dependencies
 * - Dependency tracking for incremental builds
 */
import path from 'node:path'
import type {
  TitanConfig,
  BaseEntry,
  LoadContext,
  TransformContext,
  GenerateContext,
  EmitContext,
} from '@titan/types'
import { Pipeline } from './pipeline.js'
import { loadSourceFiles, loadFile } from './loader.js'
import { createMarkdownProcessor, transformEntry } from './transformer.js'
import { buildSiteData, generateRoutes } from './generator.js'
import { emitRoutes } from './emitter.js'
import { FileSystemCache } from './cache.js'
import { CollectionRegistry } from './collection-registry.js'
import { SingletonRegistry } from './singleton-registry.js'
import { buildExecutionPlan, executePluginPlan } from './ioc.js'
import { DependencyTracker, hashFile, hashData } from './dependency-tracker.js'

export interface EngineOptions {
  /** Project root directory (absolute) */
  rootDir: string
  /** Resolved config */
  config: TitanConfig
  /** Skip cache */
  noCache?: boolean
}

export class Engine {
  private rootDir: string
  private config: TitanConfig
  private cache: FileSystemCache
  private noCache: boolean

  // Phase 2 registries
  readonly collections = new CollectionRegistry()
  readonly singletons = new SingletonRegistry()
  private depTracker: DependencyTracker

  // Pipeline stages
  readonly loadPipeline = new Pipeline<LoadContext>()
  readonly transformPipeline = new Pipeline<TransformContext>()
  readonly generatePipeline = new Pipeline<GenerateContext>()
  readonly emitPipeline = new Pipeline<EmitContext>()

  constructor(options: EngineOptions) {
    this.rootDir = options.rootDir
    this.config = options.config
    this.noCache = options.noCache ?? false

    const cacheDir = path.join(this.rootDir, options.config.build.cacheDir)
    this.cache = new FileSystemCache(cacheDir)
    this.singletons.setCacheDir(cacheDir)
    this.depTracker = new DependencyTracker(cacheDir)
  }

  /**
   * Run the full build pipeline
   */
  async build(): Promise<BuildResult> {
    const startTime = Date.now()

    // Initialize cache and dependency tracker
    if (!this.noCache) {
      await this.cache.init()
      await this.depTracker.init()
    }

    // ── Phase 2: Register plugin collections/singletons ──
    this.registerPluginContent()

    // ── Phase 2: IoC - build execution plan and validate ──
    const plan = buildExecutionPlan(this.config.plugins)

    // Register plugin hooks (respecting DAG order)
    this.registerPluginHooks()

    // ── Phase 2: Resolve singletons ──
    const singletonData = await this.singletons.resolveAll(this.rootDir)

    // Record singleton hashes for dependency tracking
    if (!this.noCache) {
      for (const [name, data] of singletonData) {
        this.depTracker.recordSingletonHash(name, hashData(data))
      }
    }

    // ── Stage 1: Load ──
    const sourceDir = path.join(this.rootDir, this.config.source)
    const loadContexts = await loadSourceFiles({ sourceDir })

    // Load custom collection files
    for (const def of this.collections.getAll()) {
      const collectionContexts = await this.collections.loadFiles(def.name, this.rootDir)
      loadContexts.push(...collectionContexts)
    }

    // Run load pipeline on each context
    for (const ctx of loadContexts) {
      await this.loadPipeline.run(ctx)
    }

    // ── Stage 2: Transform (article-level concurrency) ──
    const processor = createMarkdownProcessor(this.config.markdown)
    const concurrency = this.config.build.concurrency
    const entries: BaseEntry[] = []

    // Process in batches for concurrency control
    for (let i = 0; i < loadContexts.length; i += concurrency) {
      const batch = loadContexts.slice(i, i + concurrency)
      const results = await Promise.all(
        batch.map(async (loadCtx) => {
          // Check cache
          if (!this.noCache && await this.cache.isValid(loadCtx.filePath)) {
            const cached = await this.cache.get(loadCtx.filePath)
            if (cached) return cached
          }

          // Transform
          const transformCtx = await transformEntry(loadCtx, processor, sourceDir)

          // Run transform pipeline
          await this.transformPipeline.run(transformCtx)

          // Update entry with pipeline results
          transformCtx.entry.html = transformCtx.html

          // Cache the result
          if (!this.noCache) {
            await this.cache.set(loadCtx.filePath, transformCtx.entry)
          }

          return transformCtx.entry
        }),
      )
      entries.push(...results)
    }

    // ── Stage 3: Generate ──
    const siteData = buildSiteData(entries)

    // Inject singleton data into siteData
    for (const [name, data] of singletonData) {
      (siteData as any)[name] = data
    }

    const routes = generateRoutes(siteData)

    // Generate routes for custom collections
    for (const def of this.collections.getAll()) {
      const collectionEntries = entries.filter(e => e.contentType === def.name)
      const collectionRoutes = this.collections.generateRoutes(def.name, collectionEntries)
      routes.push(...collectionRoutes)
    }

    const generateCtx: GenerateContext = { siteData, routes }

    await this.generatePipeline.run(generateCtx)

    // Record dependency data
    if (!this.noCache) {
      // Record tag/category counts
      const tagCounts: Record<string, number> = {}
      for (const [slug, tag] of siteData.tags) tagCounts[slug] = tag.count
      this.depTracker.recordTagCounts(tagCounts)

      const catCounts: Record<string, number> = {}
      for (const [slug, cat] of siteData.categories) catCounts[slug] = cat.count
      this.depTracker.recordCategoryCounts(catCounts)

      // Record per-entry dependencies
      for (const entry of entries) {
        const post = entry as any
        this.depTracker.recordEntry(entry.id, {
          fileHash: '', // already tracked by FileSystemCache
          tagSlugs: (post.tags ?? []).map((t: any) => t.slug),
          categorySlugs: (post.categories ?? []).map((c: any) => c.slug),
          singletonNames: [], // TODO: track at access time
          layoutName: '',
        })
      }
    }

    // ── Stage 4: Emit ──
    const outDir = path.join(this.rootDir, this.config.build.outDir)
    const emitContexts = await emitRoutes(
      generateCtx.routes,
      generateCtx.siteData,
      {
        outDir,
        siteConfig: {
          title: this.config.title,
          url: this.config.url,
          language: this.config.language,
        },
      },
    )

    // Run emit pipeline on each context
    for (const ctx of emitContexts) {
      await this.emitPipeline.run(ctx)
    }

    // Save cache and dependency manifests
    if (!this.noCache) {
      await this.cache.saveManifest()
      await this.depTracker.save()
    }

    const elapsed = Date.now() - startTime

    return {
      entries: entries.length,
      routes: generateCtx.routes.length,
      elapsed,
      outDir,
    }
  }

  /**
   * Clean cache and output directories
   */
  async clean(): Promise<void> {
    await this.cache.clear()
    const outDir = path.join(this.rootDir, this.config.build.outDir)
    const { rm } = await import('node:fs/promises')
    await rm(outDir, { recursive: true, force: true })
  }

  /**
   * Register collections and singletons from plugins
   */
  private registerPluginContent(): void {
    for (const plugin of this.config.plugins) {
      for (const col of plugin.collections ?? []) {
        this.collections.register(col)
      }
      for (const s of plugin.singletons ?? []) {
        this.singletons.register(s)
      }
    }
  }

  /**
   * Register plugin hooks into pipelines
   */
  private registerPluginHooks(): void {
    for (const plugin of this.config.plugins) {
      if (!plugin.hooks) continue

      // Load hooks
      if (plugin.hooks['load:before']) this.loadPipeline.use(plugin.hooks['load:before'])
      if (plugin.hooks['load:after']) this.loadPipeline.use(plugin.hooks['load:after'])

      // Transform hooks
      if (plugin.hooks['transform:entry']) this.transformPipeline.use(plugin.hooks['transform:entry'])

      // Generate hooks
      if (plugin.hooks['generate:before']) this.generatePipeline.use(plugin.hooks['generate:before'])
      if (plugin.hooks['generate:routes']) this.generatePipeline.use(plugin.hooks['generate:routes'])
      if (plugin.hooks['generate:after']) this.generatePipeline.use(plugin.hooks['generate:after'])

      // Emit hooks
      if (plugin.hooks['emit:before']) this.emitPipeline.use(plugin.hooks['emit:before'])
      if (plugin.hooks['emit:after']) this.emitPipeline.use(plugin.hooks['emit:after'])
    }
  }
}

export interface BuildResult {
  entries: number
  routes: number
  elapsed: number
  outDir: string
}
