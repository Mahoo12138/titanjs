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

export class Engine {
  private rootDir: string
  private config: TitanConfig
  private cache: FileSystemCache
  private noCache: boolean

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

    // ── Phase 2: Register plugin collections/singletons/widgets ──
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
      const collectionContexts = await this.collections.loadFiles(def.name, sourceDir)
      loadContexts.push(...collectionContexts)
    }

    // Run load pipeline on each context
    for (const ctx of loadContexts) {
      await this.loadPipeline.run(ctx)
    }

    // ── Stage 2: Transform (article-level concurrency) ──
    // Collect remarkPlugins / rehypePlugins from all registered plugins
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

    // Compute a pipeline fingerprint so the cache is invalidated when plugins change
    if (!this.noCache) {
      const serializePlugins = (plugins: unknown[]) =>
        plugins.map(p =>
          Array.isArray(p)
            ? p.map(item => (typeof item === 'function' ? item.name : String(item))).join('+')
            : (typeof p === 'function' ? p.name : String(p))
        ).join(',')
      const pipelineStr =
        serializePlugins(mergedMarkdown.remarkPlugins ?? []) + '|' +
        serializePlugins(mergedMarkdown.rehypePlugins ?? [])
      const pipelineHash = crypto.createHash('sha256').update(pipelineStr).digest('hex').slice(0, 16)
      this.cache.setPipelineHash(pipelineHash)
    }

    const processor = createMarkdownProcessor(mergedMarkdown)
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
      // Inject custom collection into siteData so layouts can find entries
      ;(siteData as any)[def.name] = createCollection(def.name, collectionEntries)
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

    // ── Phase 3: Load theme ──
    const theme = await loadTheme(
      this.config.theme,
      this.rootDir,
      this.config.plugins,
    )

    // Register theme widgets into WidgetRegistry
    if (theme?.definition.widgets) {
      this.widgets.registerAll(theme.definition.widgets)
    }
    if (theme?.definition.siteTree) {
      this.widgets.setSiteTree(theme.definition.siteTree)
    }
    if (theme?.definition.widgetsConfig) {
      this.widgets.setWidgetsConfig(theme.definition.widgetsConfig)
    }
    // Attach widget registry to theme for renderer access
    if (theme) {
      ;(theme as any).widgetRegistry = this.widgets
    }

    // ── Phase 4: Build styles ──
    if (theme) {
      const resolvedStyles = await buildStyles({
        themeDir: theme.rootDir,
        themeName: theme.definition.name,
        plugins: this.config.plugins.map(p => ({
          name: p.name,
          globalStyles: p.globalStyles,
          slotStyles: undefined,  // slot styles collected from slot components in future
        })),
        userStyles: this.config.styles?.tokens || this.config.styles?.global
          ? {
              tokens: this.config.styles.tokens,
              global: this.config.styles.global,
            }
          : undefined,
        rootDir: this.rootDir,
      })

      // Log style warnings
      for (const warning of resolvedStyles.warnings) {
        console.warn(`[style] ${warning}`)
      }

      // Attach resolved styles to theme
      theme.resolvedStyles = {
        css: resolvedStyles.css,
        warnings: resolvedStyles.warnings,
      }
      // Also set the legacy styles field for backward compat
      theme.styles = resolvedStyles.css
    }

    // ── Stage 4: Emit ──
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
      // If a plugin modified ctx.html, re-write the file
      if (ctx.html !== originalHtml) {
        await fs.mkdir(path.dirname(ctx.outputPath), { recursive: true })
        await fs.writeFile(ctx.outputPath, ctx.html, 'utf-8')
      }
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
