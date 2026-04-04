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
 *
 * Dev Server refactor:
 * - build() decomposed into public sub-methods for DevSession reuse:
 *   init(), loadAll(), transformAll(), generate(), resolveTheme(), emit()
 */
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import type {
  TitanConfig,
  BaseEntry,
  LoadContext,
  TransformContext,
  GenerateContext,
  EmitContext,
  ResolvedTheme,
  SiteData,
  Route,
} from '@titan/types'
import { Pipeline } from './pipeline.js'
import { loadSourceFiles, loadFile } from './loader.js'
import { createMarkdownProcessor, transformEntry } from './transformer.js'
import { buildSiteData, generateRoutes, createCollection } from './generator.js'
import { emitRoutes, renderRoutes } from './emitter.js'
import { emitRoutesWithTheme, renderRoutesWithTheme } from './theme-emitter.js'
import { loadTheme } from './theme-loader.js'
import { FileSystemCache } from './cache.js'
import { CollectionRegistry } from './collection-registry.js'
import { SingletonRegistry } from './singleton-registry.js'
import { WidgetRegistry } from './widget-registry.js'
import { DependencyTracker, hashFile, hashData } from './dependency-tracker.js'
import { PluginManager } from './plugin-manager.js'
import { StyleManager } from './style-manager.js'
import { TitanEventEmitter } from './event-emitter.js'
import { runConcurrent } from './concurrency.js'

export interface EngineOptions {
  /** Project root directory (absolute) */
  rootDir: string
  /** Resolved config */
  config: TitanConfig
  /** Skip cache */
  noCache?: boolean
}

/** Result of the load stage */
export interface LoadResult {
  loadContexts: LoadContext[]
  singletonData: Map<string, unknown>
}

/** Result of the transform stage */
export interface TransformResult {
  entries: BaseEntry[]
}

/** Result of the generate stage */
export interface GenerateResult {
  siteData: SiteData
  routes: Route[]
  generateCtx: GenerateContext
}

/** Result of theme resolution */
export interface ThemeResult {
  theme: ResolvedTheme | null
}

export class Engine {
  readonly rootDir: string
  readonly config: TitanConfig
  private cache: FileSystemCache
  private noCache: boolean
  private initialized = false

  // Phase 2 registries
  readonly collections = new CollectionRegistry()
  readonly singletons = new SingletonRegistry()
  readonly widgets = new WidgetRegistry()
  private depTracker: DependencyTracker

  // Extracted managers
  readonly pluginManager: PluginManager
  private styleManager = new StyleManager()

  // Event bus for lifecycle notifications
  readonly events = new TitanEventEmitter()

  // Pipeline stages
  readonly loadPipeline = new Pipeline<LoadContext>()
  readonly transformPipeline = new Pipeline<TransformContext>()
  readonly generatePipeline = new Pipeline<GenerateContext>()
  readonly emitPipeline = new Pipeline<EmitContext>()

  // Entry ID → source file content hash (populated during transform)
  private entryFileHashes = new Map<string, string>()

  // Reusable processor (created once during init)
  private processor: ReturnType<typeof createMarkdownProcessor> | null = null
  private mergedMarkdown: typeof this.config.markdown | null = null

  constructor(options: EngineOptions) {
    this.rootDir = options.rootDir
    this.config = options.config
    this.noCache = options.noCache ?? false
    this.pluginManager = new PluginManager(options.config.plugins)

    const cacheDir = path.join(this.rootDir, options.config.build.cacheDir)
    this.cache = new FileSystemCache(cacheDir)
    this.singletons.setCacheDir(cacheDir)
    this.depTracker = new DependencyTracker(cacheDir)
  }

  /**
   * Get the resolved source directory
   */
  get sourceDir(): string {
    return path.join(this.rootDir, this.config.source)
  }

  /**
   * Initialize engine: cache, plugins, hooks, markdown processor.
   * Must call before other stage methods. Idempotent.
   */
  async init(): Promise<void> {
    if (this.initialized) return

    // Initialize cache and dependency tracker
    if (!this.noCache) {
      await this.cache.init()
      await this.depTracker.init()
    }

    // Register plugin collections/singletons/widgets
    this.pluginManager.registerContent(this.collections, this.singletons)

    // IoC - build execution plan, validate deps, register hooks in tier order
    this.pluginManager.buildPlanAndRegisterHooks({
      load: this.loadPipeline,
      transform: this.transformPipeline,
      generate: this.generatePipeline,
      emit: this.emitPipeline,
    })

    // Run plugin setup lifecycle hooks
    await this.pluginManager.runSetup({ rootDir: this.rootDir, config: this.config })

    // Build merged markdown config and processor
    this.mergedMarkdown = this.buildMergedMarkdown()
    this.processor = createMarkdownProcessor(this.mergedMarkdown)

    // Compute pipeline fingerprint for cache invalidation
    if (!this.noCache) {
      const pipelineHash = this.computePipelineHash(this.mergedMarkdown)
      this.cache.setPipelineHash(pipelineHash)
    }

    this.initialized = true
  }

  /**
   * Stage 1: Load all source files and resolve singletons
   */
  async loadAll(): Promise<LoadResult> {
    this.events.emit('load:start', { sourceDir: this.sourceDir })

    // Resolve singletons
    const singletonData = await this.singletons.resolveAll(this.rootDir)

    // Record singleton hashes for dependency tracking
    if (!this.noCache) {
      for (const [name, data] of singletonData) {
        this.depTracker.recordSingletonHash(name, hashData(data))
      }
    }

    // Scan source files
    const loadContexts = await loadSourceFiles({ sourceDir: this.sourceDir })

    // Load custom collection files
    for (const def of this.collections.getAll()) {
      const collectionContexts = await this.collections.loadFiles(def.name, this.sourceDir)
      loadContexts.push(...collectionContexts)
    }

    // Run load pipeline on each context (sliding-window concurrency)
    const concurrency = this.config.build.concurrency
    await runConcurrent(loadContexts, concurrency, ctx => this.loadPipeline.run(ctx))

    this.events.emit('load:complete', { fileCount: loadContexts.length })

    return { loadContexts, singletonData }
  }

  /**
   * Stage 2: Transform loaded contexts into entries (with concurrency + cache)
   */
  async transformAll(loadContexts: LoadContext[]): Promise<TransformResult> {
    this.events.emit('transform:start', { entryCount: loadContexts.length })

    const processor = this.processor!
    const concurrency = this.config.build.concurrency

    const entries = await runConcurrent(
      loadContexts,
      concurrency,
      loadCtx => this.transformSingle(loadCtx, processor),
    )

    this.events.emit('transform:complete', { entryCount: entries.length })

    return { entries }
  }

  /**
   * Transform a single LoadContext into an entry.
   * Public so DevSession can use it for on-demand single-entry transforms.
   */
  async transformSingle(
    loadCtx: LoadContext,
    processor?: ReturnType<typeof createMarkdownProcessor>,
  ): Promise<BaseEntry> {
    const proc = processor ?? this.processor!

    // Check cache
    if (!this.noCache && await this.cache.isValid(loadCtx.filePath)) {
      const cached = await this.cache.get(loadCtx.filePath)
      if (cached) return cached
    }

    // Transform
    const transformCtx = await transformEntry(loadCtx, proc, this.sourceDir)

    // Compute and store file content hash for dependency tracking
    const contentHash = hashData(loadCtx.rawContent)
    this.entryFileHashes.set(transformCtx.entry.id, contentHash)

    // Run transform pipeline (plugin hooks)
    await this.transformPipeline.run(transformCtx)

    // Update entry with pipeline results
    transformCtx.entry.html = transformCtx.html

    // Cache the result
    if (!this.noCache) {
      await this.cache.set(loadCtx.filePath, transformCtx.entry)
    }

    this.events.emit('entry:transformed', {
      entryId: transformCtx.entry.id,
      contentType: transformCtx.entry.contentType,
    })

    return transformCtx.entry
  }

  /**
   * Stage 3: Generate site data and routes from entries
   */
  async generate(
    entries: BaseEntry[],
    singletonData: Map<string, unknown>,
  ): Promise<GenerateResult> {
    this.events.emit('generate:start', {})

    const siteData = buildSiteData(entries)

    // Inject singleton data into siteData
    for (const [name, data] of singletonData) {
      siteData[name] = data
    }

    const routes = generateRoutes(siteData)

    // Generate routes for custom collections
    for (const def of this.collections.getAll()) {
      const collectionEntries = entries.filter(e => e.contentType === def.name)
      siteData[def.name] = createCollection(def.name, collectionEntries)
      const collectionRoutes = this.collections.generateRoutes(def.name, collectionEntries)
      routes.push(...collectionRoutes)
    }

    const generateCtx: GenerateContext = { siteData, routes }
    await this.generatePipeline.run(generateCtx)

    // Record dependency data
    if (!this.noCache) {
      this.recordDependencies(siteData, entries)
    }

    this.events.emit('generate:complete', { routeCount: generateCtx.routes.length })

    return { siteData, routes: generateCtx.routes, generateCtx }
  }

  /**
   * Resolve and prepare theme (load, register widgets, build styles)
   */
  async resolveTheme(): Promise<ThemeResult> {
    const theme = await loadTheme(
      this.config.theme,
      this.rootDir,
      this.config.plugins,
    )

    if (theme) {
      // Register theme widgets into WidgetRegistry
      if (theme.definition.widgets) {
        this.widgets.registerAll(theme.definition.widgets)
      }
      if (theme.definition.siteTree) {
        this.widgets.setSiteTree(theme.definition.siteTree)
      }
      if (theme.definition.widgetsConfig) {
        this.widgets.setWidgetsConfig(theme.definition.widgetsConfig)
      }
      // Attach widget registry to theme for renderer access
      theme.widgetRegistry = this.widgets

      // Build styles via StyleManager
      await this.styleManager.buildThemeStyles(
        theme,
        this.pluginManager.getPlugins(),
        this.config,
        this.rootDir,
      )

      this.events.emit('theme:loaded', { themeName: theme.definition.name })
    }

    return { theme }
  }

  /**
   * Stage 4: Emit routes to disk
   *
   * Flow: render HTML → run emit pipeline hooks → write to disk.
   * This ensures hooks can modify HTML before it hits the file system.
   */
  async emit(
    generateCtx: GenerateContext,
    theme: ResolvedTheme | null,
  ): Promise<EmitContext[]> {
    this.events.emit('emit:start', { routeCount: generateCtx.routes.length })

    const outDir = path.join(this.rootDir, this.config.build.outDir)
    const siteConfig = {
      title: this.config.title,
      url: this.config.url,
      language: this.config.language,
    }

    // Step 1: Render all routes to HTML (no disk I/O)
    const emitContexts = theme
      ? await renderRoutesWithTheme(
          generateCtx.routes,
          generateCtx.siteData,
          { outDir, siteConfig, theme },
        )
      : await renderRoutes(
          generateCtx.routes,
          generateCtx.siteData,
          { outDir, siteConfig },
        )

    // Step 2: Run emit pipeline on each context (hooks can modify html)
    for (const ctx of emitContexts) {
      await this.emitPipeline.run(ctx)
    }

    // Step 3: Write all (possibly modified) HTML to disk
    for (const ctx of emitContexts) {
      await fs.mkdir(path.dirname(ctx.outputPath), { recursive: true })
      await fs.writeFile(ctx.outputPath, ctx.html, 'utf-8')
      this.events.emit('route:emitted', { url: ctx.route.url, outputPath: ctx.outputPath })
    }

    this.events.emit('emit:complete', { routeCount: emitContexts.length })

    return emitContexts
  }

  /**
   * Render a single route to HTML (without writing to disk).
   * Used by DevSession for on-demand page rendering.
   */
  async renderRoute(
    route: Route,
    siteData: SiteData,
    theme: ResolvedTheme | null,
  ): Promise<string | null> {
    const outDir = path.join(this.rootDir, this.config.build.outDir)
    const siteConfig = {
      title: this.config.title,
      url: this.config.url,
      language: this.config.language,
    }

    // Render without writing to disk
    const emitContexts = theme
      ? await renderRoutesWithTheme(
          [route],
          siteData,
          { outDir, siteConfig, theme },
        )
      : await renderRoutes(
          [route],
          siteData,
          { outDir, siteConfig },
        )

    if (emitContexts.length === 0) return null

    const ctx = emitContexts[0]
    await this.emitPipeline.run(ctx)
    return ctx.html
  }

  /**
   * Run the full build pipeline (composes init → load → transform → generate → theme → emit)
   */
  async build(): Promise<BuildResult> {
    const startTime = Date.now()
    this.events.emit('build:start', { rootDir: this.rootDir })

    await this.init()

    const { loadContexts, singletonData } = await this.loadAll()
    const { entries } = await this.transformAll(loadContexts)
    const { generateCtx } = await this.generate(entries, singletonData)
    const { theme } = await this.resolveTheme()
    await this.emit(generateCtx, theme)

    // Save cache and dependency manifests
    if (!this.noCache) {
      await this.cache.saveManifest()
      await this.depTracker.save()
    }

    const elapsed = Date.now() - startTime
    const outDir = path.join(this.rootDir, this.config.build.outDir)

    this.events.emit('build:complete', {
      entries: entries.length,
      routes: generateCtx.routes.length,
      elapsed,
    })

    return {
      entries: entries.length,
      routes: generateCtx.routes.length,
      elapsed,
      outDir,
    }
  }

  /**
   * Clean cache and output directories, run plugin teardown
   */
  async clean(): Promise<void> {
    // Run plugin teardown lifecycle hooks
    await this.pluginManager.runTeardown()

    await this.cache.clear()
    const outDir = path.join(this.rootDir, this.config.build.outDir)
    const { rm } = await import('node:fs/promises')
    await rm(outDir, { recursive: true, force: true })
  }

  /**
   * Build the merged markdown config (base + plugin remark/rehype plugins)
   */
  private buildMergedMarkdown() {
    const mergedMarkdown = { ...this.config.markdown }
    const { remarkPlugins, rehypePlugins } = this.pluginManager.collectMarkdownPlugins()
    mergedMarkdown.remarkPlugins = [
      ...remarkPlugins,
      ...(mergedMarkdown.remarkPlugins ?? []),
    ]
    mergedMarkdown.rehypePlugins = [
      ...rehypePlugins,
      ...(mergedMarkdown.rehypePlugins ?? []),
    ]
    return mergedMarkdown
  }

  /**
   * Compute a pipeline hash for cache invalidation
   */
  private computePipelineHash(mergedMarkdown: typeof this.config.markdown): string {
    const serializePlugins = (plugins: unknown[]) =>
      plugins.map(p =>
        Array.isArray(p)
          ? p.map(item => (typeof item === 'function' ? item.name : String(item))).join('+')
          : (typeof p === 'function' ? p.name : String(p))
      ).join(',')
    const pipelineStr =
      serializePlugins(mergedMarkdown.remarkPlugins ?? []) + '|' +
      serializePlugins(mergedMarkdown.rehypePlugins ?? [])
    return crypto.createHash('sha256').update(pipelineStr).digest('hex').slice(0, 16)
  }

  /**
   * Record dependency tracking data for incremental builds
   */
  private recordDependencies(siteData: SiteData, entries: BaseEntry[]): void {
    const tagCounts: Record<string, number> = {}
    for (const [slug, tag] of siteData.tags) tagCounts[slug] = tag.count
    this.depTracker.recordTagCounts(tagCounts)

    const catCounts: Record<string, number> = {}
    for (const [slug, cat] of siteData.categories) catCounts[slug] = cat.count
    this.depTracker.recordCategoryCounts(catCounts)

    for (const entry of entries) {
      const isPost = entry.contentType === 'post'
      const post = isPost ? (entry as import('@titan/types').Post) : null
      this.depTracker.recordEntry(entry.id, {
        fileHash: this.entryFileHashes.get(entry.id) ?? '',
        tagSlugs: post?.tags?.map(t => t.slug) ?? [],
        categorySlugs: post?.categories?.map(c => c.slug) ?? [],
        singletonNames: [],
        layoutName: '',
      })
    }
  }
}

export interface BuildResult {
  entries: number
  routes: number
  elapsed: number
  outDir: string
}
