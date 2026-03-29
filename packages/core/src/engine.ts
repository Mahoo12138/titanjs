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
import { emitRoutes } from './emitter.js'
import { emitRoutesWithTheme } from './theme-emitter.js'
import { loadTheme } from './theme-loader.js'
import { FileSystemCache } from './cache.js'
import { CollectionRegistry } from './collection-registry.js'
import { SingletonRegistry } from './singleton-registry.js'
import { WidgetRegistry } from './widget-registry.js'
import { buildExecutionPlan, executePluginPlan } from './ioc.js'
import { DependencyTracker, hashFile, hashData } from './dependency-tracker.js'
import { buildStyles } from './styles.js'

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

  // Pipeline stages
  readonly loadPipeline = new Pipeline<LoadContext>()
  readonly transformPipeline = new Pipeline<TransformContext>()
  readonly generatePipeline = new Pipeline<GenerateContext>()
  readonly emitPipeline = new Pipeline<EmitContext>()

  // Reusable processor (created once during init)
  private processor: ReturnType<typeof createMarkdownProcessor> | null = null
  private mergedMarkdown: typeof this.config.markdown | null = null

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
    this.registerPluginContent()

    // IoC - build execution plan and validate
    buildExecutionPlan(this.config.plugins)

    // Register plugin hooks (respecting DAG order)
    this.registerPluginHooks()

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

    // Run load pipeline on each context
    for (const ctx of loadContexts) {
      await this.loadPipeline.run(ctx)
    }

    return { loadContexts, singletonData }
  }

  /**
   * Stage 2: Transform loaded contexts into entries (with concurrency + cache)
   */
  async transformAll(loadContexts: LoadContext[]): Promise<TransformResult> {
    const processor = this.processor!
    const concurrency = this.config.build.concurrency
    const entries: BaseEntry[] = []

    for (let i = 0; i < loadContexts.length; i += concurrency) {
      const batch = loadContexts.slice(i, i + concurrency)
      const results = await Promise.all(
        batch.map(loadCtx => this.transformSingle(loadCtx, processor)),
      )
      entries.push(...results)
    }

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

    // Run transform pipeline (plugin hooks)
    await this.transformPipeline.run(transformCtx)

    // Update entry with pipeline results
    transformCtx.entry.html = transformCtx.html

    // Cache the result
    if (!this.noCache) {
      await this.cache.set(loadCtx.filePath, transformCtx.entry)
    }

    return transformCtx.entry
  }

  /**
   * Stage 3: Generate site data and routes from entries
   */
  async generate(
    entries: BaseEntry[],
    singletonData: Map<string, unknown>,
  ): Promise<GenerateResult> {
    const siteData = buildSiteData(entries)

    // Inject singleton data into siteData
    for (const [name, data] of singletonData) {
      (siteData as any)[name] = data
    }

    const routes = generateRoutes(siteData)

    // Generate routes for custom collections
    for (const def of this.collections.getAll()) {
      const collectionEntries = entries.filter(e => e.contentType === def.name)
      ;(siteData as any)[def.name] = createCollection(def.name, collectionEntries)
      const collectionRoutes = this.collections.generateRoutes(def.name, collectionEntries)
      routes.push(...collectionRoutes)
    }

    const generateCtx: GenerateContext = { siteData, routes }
    await this.generatePipeline.run(generateCtx)

    // Record dependency data
    if (!this.noCache) {
      this.recordDependencies(siteData, entries)
    }

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
      ;(theme as any).widgetRegistry = this.widgets

      // Build styles
      const resolvedStyles = await buildStyles({
        themeDir: theme.rootDir,
        themeName: theme.definition.name,
        plugins: this.config.plugins.map(p => ({
          name: p.name,
          globalStyles: p.globalStyles,
          slotStyles: undefined,
        })),
        userStyles: this.config.styles?.tokens || this.config.styles?.global
          ? {
              tokens: this.config.styles.tokens,
              global: this.config.styles.global,
            }
          : undefined,
        rootDir: this.rootDir,
      })

      for (const warning of resolvedStyles.warnings) {
        console.warn(`[style] ${warning}`)
      }

      theme.resolvedStyles = {
        css: resolvedStyles.css,
        warnings: resolvedStyles.warnings,
      }
      theme.styles = resolvedStyles.css
    }

    return { theme }
  }

  /**
   * Stage 4: Emit routes to disk
   */
  async emit(
    generateCtx: GenerateContext,
    theme: ResolvedTheme | null,
  ): Promise<EmitContext[]> {
    const outDir = path.join(this.rootDir, this.config.build.outDir)
    const siteConfig = {
      title: this.config.title,
      url: this.config.url,
      language: this.config.language,
    }

    const emitContexts = theme
      ? await emitRoutesWithTheme(
          generateCtx.routes,
          generateCtx.siteData,
          { outDir, siteConfig, theme },
        )
      : await emitRoutes(
          generateCtx.routes,
          generateCtx.siteData,
          { outDir, siteConfig },
        )

    // Run emit pipeline on each context, then re-write if modified
    for (const ctx of emitContexts) {
      const originalHtml = ctx.html
      await this.emitPipeline.run(ctx)
      if (ctx.html !== originalHtml) {
        await fs.mkdir(path.dirname(ctx.outputPath), { recursive: true })
        await fs.writeFile(ctx.outputPath, ctx.html, 'utf-8')
      }
    }

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

    // Render the single route using the same theme emitter path
    const emitContexts = theme
      ? await emitRoutesWithTheme(
          [route],
          siteData,
          { outDir, siteConfig, theme },
        )
      : await emitRoutes(
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
   * Build the merged markdown config (base + plugin remark/rehype plugins)
   */
  private buildMergedMarkdown() {
    const mergedMarkdown = { ...this.config.markdown }
    const extraRemark: unknown[] = []
    const extraRehype: unknown[] = []
    for (const plugin of this.config.plugins) {
      if (plugin.remarkPlugins) extraRemark.push(...plugin.remarkPlugins)
      if (plugin.rehypePlugins) extraRehype.push(...plugin.rehypePlugins)
    }
    mergedMarkdown.remarkPlugins = [
      ...extraRemark,
      ...(mergedMarkdown.remarkPlugins ?? []),
    ]
    mergedMarkdown.rehypePlugins = [
      ...extraRehype,
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
      const post = entry as any
      this.depTracker.recordEntry(entry.id, {
        fileHash: '',
        tagSlugs: (post.tags ?? []).map((t: any) => t.slug),
        categorySlugs: (post.categories ?? []).map((c: any) => c.slug),
        singletonNames: [],
        layoutName: '',
      })
    }
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

      if (plugin.hooks['load:before']) this.loadPipeline.use(plugin.hooks['load:before'])
      if (plugin.hooks['load:after']) this.loadPipeline.use(plugin.hooks['load:after'])
      if (plugin.hooks['transform:entry']) this.transformPipeline.use(plugin.hooks['transform:entry'])
      if (plugin.hooks['generate:before']) this.generatePipeline.use(plugin.hooks['generate:before'])
      if (plugin.hooks['generate:routes']) this.generatePipeline.use(plugin.hooks['generate:routes'])
      if (plugin.hooks['generate:after']) this.generatePipeline.use(plugin.hooks['generate:after'])
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
