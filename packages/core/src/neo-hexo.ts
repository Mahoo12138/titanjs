/**
 * @neo-hexo/core — NeoHexo Main Class
 *
 * The central orchestrator. Manages config, plugins, lifecycle hooks,
 * the service container, and core subsystems (Box, Router, Render, Post, Scaffold).
 */

import * as nodePath from 'node:path';
import { Context } from './context.js';
import { type UserConfig, resolveConfig } from './config.js';
import { createLifecycleHooks, type LifecycleHookInstances, type ResolvedConfig } from './lifecycle.js';
import { type NeoHexoPlugin, sortPlugins } from './plugin.js';
import type { Disposable } from './hooks.js';
import { Box } from './box.js';
import { Router, RouterServiceKey } from './router.js';
import { RenderPipeline, RenderServiceKey } from './render.js';
import { PostProcessor, PostServiceKey, type FrontMatterParser } from './post.js';
import { ScaffoldManager, ScaffoldServiceKey } from './scaffold.js';
import { HelperRegistry, HelperRegistryKey } from './helper-registry.js';
import { CommandRegistry, CommandRegistryKey } from './command-registry.js';
import { ViewRegistry, ViewRegistryKey } from './view-registry.js';

// ─── NeoHexo ─────────────────────────────────────────────────────────────────

export class NeoHexo {
  /** Root service container. */
  readonly ctx: Context;
  /** All lifecycle hooks. */
  readonly hooks: LifecycleHookInstances;
  /** Resolved configuration (available after init). */
  config!: ResolvedConfig;

  // ── Subsystems (available after init) ──
  /** Source file processor. */
  box!: Box;
  /** URL route table. */
  router!: Router;
  /** Render pipeline (dispatches to registered renderers). */
  render!: RenderPipeline;
  /** Post creation / rendering / publishing. */
  post!: PostProcessor;
  /** Scaffold templates for new content. */
  scaffold!: ScaffoldManager;
  /** Template helper functions registry. */
  helpers!: HelperRegistry;
  /** Template view registry. */
  views!: ViewRegistry;
  /** CLI command registry. */
  commands!: CommandRegistry;

  private userConfig: UserConfig;
  private baseDir: string;
  private plugins: NeoHexoPlugin[] = [];
  private pluginDisposables: Disposable[] = [];
  private initialized = false;

  constructor(baseDir: string, userConfig: UserConfig = {}) {
    this.baseDir = baseDir;
    this.userConfig = userConfig;
    this.ctx = new Context();
    this.hooks = createLifecycleHooks();
  }

  /**
   * Initialize: resolve config, bootstrap subsystems, load plugins,
   * run configLoaded/configResolved hooks.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // 1. Resolve config
    this.config = resolveConfig(this.userConfig, this.baseDir);

    // 2. Bootstrap core subsystems
    this.initSubsystems();

    // 3. Collect and sort plugins
    this.plugins = sortPlugins(this.userConfig.plugins ?? []);

    // 4. Apply each plugin
    for (const plugin of this.plugins) {
      await this.applyPlugin(plugin);
    }

    // 5. Load scaffolds from disk
    await this.scaffold.load();

    // 6. Run config hooks
    await this.hooks.configLoaded.call(this.config);
    await this.hooks.configResolved.call(this.config);

    this.initialized = true;
  }

  /**
   * Create and wire all core subsystems.
   */
  private initSubsystems(): void {
    const cfg = this.config;

    // ── Box ──
    this.box = new Box(cfg.sourceDir);

    // ── Router ──
    this.router = new Router();
    this.ctx.provide(RouterServiceKey, this.router);

    // ── Render ──
    this.render = new RenderPipeline();
    this.ctx.provide(RenderServiceKey, this.render);

    // ── Scaffold ──
    const scaffoldDir = nodePath.join(this.baseDir, 'scaffolds');
    this.scaffold = new ScaffoldManager(scaffoldDir);
    this.ctx.provide(ScaffoldServiceKey, this.scaffold);

    // ── Post ──
    // A minimal built-in front-matter parser (plugins can override via PostProcessor.setRenderer)
    const frontMatterParser: FrontMatterParser = (source: string) => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
      if (!match) return { data: {}, content: source, excerpt: '' };
      const raw = match[1]!;
      const content = source.slice(match[0].length);
      const data: Record<string, unknown> = {};
      for (const line of raw.split('\n')) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const key = line.slice(0, idx).trim();
          const val = line.slice(idx + 1).trim();
          data[key] = val;
        }
      }
      const excerptIdx = content.indexOf('<!-- more -->');
      const excerpt = excerptIdx >= 0 ? content.slice(0, excerptIdx).trim() : '';
      return { data, content, excerpt };
    };

    this.post = new PostProcessor({
      frontMatterParser,
      contentRenderer: async (source, opts) => {
        const result = await this.render.render(source, opts);
        return result.content;
      },
    });
    this.ctx.provide(PostServiceKey, this.post);

    // ── Helper Registry ──
    this.helpers = new HelperRegistry();
    this.ctx.provide(HelperRegistryKey, this.helpers);

    // ── View Registry ──
    this.views = new ViewRegistry();
    this.ctx.provide(ViewRegistryKey, this.views);

    // ── Command Registry ──
    this.commands = new CommandRegistry();
    this.ctx.provide(CommandRegistryKey, this.commands);
  }

  /**
   * Apply a single plugin: tap its declarative hooks, then call apply().
   */
  private async applyPlugin(plugin: NeoHexoPlugin): Promise<void> {
    const childCtx = this.ctx.scope();

    // Tap declarative hooks
    if (plugin.hooks) {
      for (const [hookName, handler] of Object.entries(plugin.hooks)) {
        const hook = (this.hooks as Record<string, unknown>)[hookName];
        if (hook && typeof (hook as { tap: unknown }).tap === 'function') {
          const tapOptions = {
            name: plugin.name,
            enforce: plugin.enforce,
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const disposable = (hook as any).tap(
            tapOptions,
            handler,
          );
          childCtx.track(disposable);
        }
      }
    }

    // Call imperative apply
    if (plugin.apply) {
      const disposable = await plugin.apply(childCtx);
      if (disposable) {
        childCtx.track(disposable);
      }
    }

    this.pluginDisposables.push({ dispose: () => childCtx.dispose() });
  }

  /**
   * Full build: process sources, run generators, write output.
   */
  async build(): Promise<void> {
    if (!this.initialized) await this.init();

    // ── Process source files ──
    await this.hooks.beforeProcess.call();
    const files = await this.box.process();

    // Fire processFile hook for each changed file
    for (const file of files) {
      if (file.type !== 'skip') {
        await this.hooks.processFile.call(file);
      }
    }
    await this.hooks.afterProcess.call();

    // ── Generate ──
    const locals = this.getSiteLocals();

    await this.hooks.beforeGenerate.call(locals);
    await this.hooks.generateRoutes.call(locals);
    await this.hooks.afterGenerate.call();
  }

  /**
   * Deploy the generated site.
   */
  async deploy(): Promise<void> {
    await this.hooks.beforeDeploy.call();
    await this.hooks.deploy.call();
    await this.hooks.afterDeploy.call();
  }

  /**
   * Graceful shutdown.
   */
  async exit(error?: Error): Promise<void> {
    await this.hooks.beforeExit.call(error);

    // Dispose all plugin contexts
    for (const d of this.pluginDisposables) {
      d.dispose();
    }
    this.pluginDisposables.length = 0;

    this.ctx.dispose();
  }

  /**
   * Get site-level locals for generators and templates.
   * (Stub — will be backed by @neo-hexo/database in Phase 2.)
   */
  private getSiteLocals() {
    return {
      posts: [],
      pages: [],
      categories: [],
      tags: [],
      data: {},
    };
  }
}
