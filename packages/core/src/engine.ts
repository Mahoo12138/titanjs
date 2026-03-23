/**
 * Engine - Orchestrates the four-stage pipeline
 *
 * Load → Transform → Generate → Emit
 *
 * This is the central coordinator that:
 * 1. Loads config
 * 2. Scans source files (Load)
 * 3. Transforms Markdown to HTML with article-level concurrency (Transform)
 * 4. Aggregates data and generates routes (Generate)
 * 5. Emits static HTML files (Emit)
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

  // Pipeline stages
  readonly loadPipeline = new Pipeline<LoadContext>()
  readonly transformPipeline = new Pipeline<TransformContext>()
  readonly generatePipeline = new Pipeline<GenerateContext>()
  readonly emitPipeline = new Pipeline<EmitContext>()

  constructor(options: EngineOptions) {
    this.rootDir = options.rootDir
    this.config = options.config
    this.noCache = options.noCache ?? false
    this.cache = new FileSystemCache(
      path.join(this.rootDir, options.config.build.cacheDir),
    )
  }

  /**
   * Run the full build pipeline
   */
  async build(): Promise<BuildResult> {
    const startTime = Date.now()

    // Initialize cache
    if (!this.noCache) {
      await this.cache.init()
    }

    // Register plugin hooks
    this.registerPluginHooks()

    // ── Stage 1: Load ──
    const sourceDir = path.join(this.rootDir, this.config.source)
    const loadContexts = await loadSourceFiles({ sourceDir })

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
    const routes = generateRoutes(siteData)
    const generateCtx: GenerateContext = { siteData, routes }

    await this.generatePipeline.run(generateCtx)

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

    // Save cache manifest
    if (!this.noCache) {
      await this.cache.saveManifest()
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
