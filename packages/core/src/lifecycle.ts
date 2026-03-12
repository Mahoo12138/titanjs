/**
 * @neo-hexo/core — Lifecycle Hook Definitions
 *
 * Defines all built-in lifecycle hooks and their strategies.
 * Plugins tap into these hooks via the declarative `hooks` object
 * or the imperative `ctx.hooks.<name>.tap(...)` API.
 */

import { Hook } from './hooks.js';

// ─── Data Types (minimal stubs — will be fleshed out in later phases) ────────

/** Resolved site configuration. */
export interface ResolvedConfig {
  title: string;
  url: string;
  sourceDir: string;
  publicDir: string;
  [key: string]: unknown;
}

/** A source file being processed. */
export interface SourceFile {
  /** Relative path from source directory. */
  path: string;
  /** Absolute path on disk. */
  source: string;
  /** File event type. */
  type: 'create' | 'update' | 'delete' | 'skip';
  /** Raw content (loaded lazily). */
  content?: string;
}

/** Post data flowing through the render pipeline. */
export interface PostData {
  /** Relative source path. */
  path: string;
  /** Raw markdown content. */
  raw: string;
  /** Rendered HTML content. */
  content: string;
  /** Front-matter data. */
  frontMatter: Record<string, unknown>;
  /** Excerpt (before <!-- more --> marker). */
  excerpt: string;
  /** Whether the post is published. */
  published: boolean;
  [key: string]: unknown;
}

/** Render context passed to afterRender hooks. */
export interface RenderData {
  path: string;
  engine: string;
  [key: string]: unknown;
}

/** A generated route. */
export interface Route {
  /** URL path (without leading slash). */
  path: string;
  /** Template layouts to try in order. */
  layout?: string[];
  /** Data passed to the template. */
  data: unknown;
  /** Whether this route's output can be cached. */
  cache?: boolean;
}

/** Site-level data passed to generators. */
export interface SiteLocals {
  posts: unknown[];
  pages: unknown[];
  categories: unknown[];
  tags: unknown[];
  data: Record<string, unknown>;
}

/** Template locals passed to views. */
export interface TemplateLocals {
  page: unknown;
  path: string;
  url: string;
  config: ResolvedConfig;
  site: SiteLocals;
  [key: string]: unknown;
}

// ─── Lifecycle Hook Type Map ─────────────────────────────────────────────────

/**
 * Maps hook names to their handler signatures.
 * Used by `NeoHexoPlugin.hooks` for type-safe declarative tapping.
 */
export interface LifecycleHooks {
  // ── Config ──
  configLoaded: (config: ResolvedConfig) => void | Promise<void>;
  configResolved: (config: ResolvedConfig) => void | Promise<void>;

  // ── Process ──
  beforeProcess: () => void | Promise<void>;
  processFile: (file: SourceFile) => void | Promise<void>;
  afterProcess: () => void | Promise<void>;

  // ── Render ──
  beforePostRender: (data: PostData) => PostData | Promise<PostData>;
  afterPostRender: (data: PostData) => PostData | Promise<PostData>;
  afterHtmlRender: (html: string) => string | Promise<string>;

  // ── Generate ──
  beforeGenerate: (locals: SiteLocals) => void | Promise<void>;
  generateRoutes: (locals: SiteLocals) => Route[] | Promise<Route[]>;
  afterGenerate: () => void | Promise<void>;

  // ── Deploy ──
  beforeDeploy: () => void | Promise<void>;
  deploy: () => void | Promise<void>;
  afterDeploy: () => void | Promise<void>;

  // ── Template ──
  resolveLocals: (locals: TemplateLocals) => TemplateLocals | Promise<TemplateLocals>;
  /** Render a route to HTML output. Theme plugin taps this. */
  renderRoute: (route: Route, locals: TemplateLocals) => string | Promise<string>;

  // ── Exit ──
  beforeExit: (error?: Error) => void | Promise<void>;
}

// ─── Hook Registry ───────────────────────────────────────────────────────────

/** All lifecycle hook instances keyed by name. */
export type LifecycleHookInstances = {
  [K in keyof LifecycleHooks]: Hook<
    Parameters<LifecycleHooks[K]>,
    ReturnType<LifecycleHooks[K]> extends Promise<infer U> ? U :
    ReturnType<LifecycleHooks[K]>
  >;
};

/**
 * Create all lifecycle hook instances with their predefined strategies.
 */
export function createLifecycleHooks(): LifecycleHookInstances {
  return {
    // Config
    configLoaded: new Hook({ name: 'configLoaded', strategy: 'sequential' }),
    configResolved: new Hook({ name: 'configResolved', strategy: 'sequential' }),

    // Process
    beforeProcess: new Hook({ name: 'beforeProcess', strategy: 'sequential' }),
    processFile: new Hook({ name: 'processFile', strategy: 'sequential' }),
    afterProcess: new Hook({ name: 'afterProcess', strategy: 'sequential' }),

    // Render
    beforePostRender: new Hook({ name: 'beforePostRender', strategy: 'waterfall' }),
    afterPostRender: new Hook({ name: 'afterPostRender', strategy: 'waterfall' }),
    afterHtmlRender: new Hook({ name: 'afterHtmlRender', strategy: 'waterfall' }),

    // Generate
    beforeGenerate: new Hook({ name: 'beforeGenerate', strategy: 'sequential' }),
    generateRoutes: new Hook({ name: 'generateRoutes', strategy: 'parallel' }),
    afterGenerate: new Hook({ name: 'afterGenerate', strategy: 'sequential' }),

    // Deploy
    beforeDeploy: new Hook({ name: 'beforeDeploy', strategy: 'sequential' }),
    deploy: new Hook({ name: 'deploy', strategy: 'sequential' }),
    afterDeploy: new Hook({ name: 'afterDeploy', strategy: 'sequential' }),

    // Template
    resolveLocals: new Hook({ name: 'resolveLocals', strategy: 'waterfall' }),
    renderRoute: new Hook({ name: 'renderRoute', strategy: 'waterfall' }),

    // Exit
    beforeExit: new Hook({ name: 'beforeExit', strategy: 'sequential' }),
  } as LifecycleHookInstances;
}
