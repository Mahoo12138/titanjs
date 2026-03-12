/**
 * @neo-hexo/theme
 *
 * Theme system plugin for Neo-Hexo.
 *
 * Responsibilities:
 *   1. Scan theme layout directory and register views into `ViewRegistry`
 *   2. Process theme source assets (register as routes)
 *   3. Load theme config (merge into site config)
 *   4. Load i18n language files
 *   5. Render routes to HTML via view resolution + template engine
 *
 * The theme system is engine-agnostic — it delegates rendering to whatever
 * `Renderer` is registered for the template extension (e.g. `.edge`).
 * Layout inheritance is handled by the template engine itself
 * (e.g. Edge.js `@layout` directive).
 *
 * Usage in `neo-hexo.yaml`:
 * ```yaml
 * plugins:
 *   - renderer-edge
 *   - name: theme
 *     dir: themes/my-theme      # default: theme/
 *   - generator
 * ```
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import type {
  NeoHexoPlugin,
  Context,
  Route,
  TemplateLocals,
  ResolvedConfig,
  View,
  ViewRegistry,
  RenderPipeline,
} from '@neo-hexo/core';
import {
  ViewRegistryKey,
  RenderServiceKey,
} from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeOptions {
  /** Theme directory path (relative to project root, default: 'theme'). */
  dir?: string;
  /** Layout subdirectory inside theme dir (default: 'layout'). */
  layoutDir?: string;
  /** Source/assets subdirectory inside theme dir (default: 'source'). */
  sourceDir?: string;
  /** Languages subdirectory (default: 'languages'). */
  languageDir?: string;
}

/** Theme configuration loaded from `_config.*` inside the theme directory. */
export interface ThemeConfig {
  [key: string]: unknown;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively list all files under a directory (relative paths).
 */
async function walkDir(dir: string, prefix = ''): Promise<string[]> {
  const results: string[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await walkDir(nodePath.join(dir, entry.name), rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

/**
 * Strip extension from a file path.
 */
function stripExt(filePath: string): string {
  const ext = nodePath.extname(filePath);
  return ext ? filePath.slice(0, -ext.length) : filePath;
}

// ─── View Loading ────────────────────────────────────────────────────────────

/**
 * Scan the layout directory and create View objects for each template.
 * Each file becomes a view named by its path without extension.
 * e.g. `layout/post.edge` → view name `post`
 *      `layout/partials/header.edge` → view name `partials/header`
 */
async function loadViews(
  layoutDir: string,
  renderFn: (source: string, ext: string, locals: Record<string, unknown>) => Promise<string>,
): Promise<View[]> {
  const files = await walkDir(layoutDir);
  const views: View[] = [];

  for (const relPath of files) {
    const name = stripExt(relPath);
    const source = nodePath.join(layoutDir, relPath);
    const ext = nodePath.extname(relPath).slice(1).toLowerCase();
    const content = await fs.readFile(source, 'utf-8');

    views.push({
      name,
      source,
      async render(locals: Record<string, unknown>): Promise<string> {
        return renderFn(content, ext, { ...locals, filename: source });
      },
    });
  }

  return views;
}

// ─── Theme Source Assets ─────────────────────────────────────────────────────

/**
 * Load theme source assets (CSS, JS, images, etc.) and return them as route data.
 */
async function loadThemeAssets(
  sourceDir: string,
): Promise<{ path: string; source: string }[]> {
  const files = await walkDir(sourceDir);
  const assets: { path: string; source: string }[] = [];

  for (const relPath of files) {
    // Skip hidden files and temp files
    if (relPath.startsWith('.') || relPath.includes('/.') || relPath.endsWith('~')) continue;

    assets.push({
      path: relPath,
      source: nodePath.join(sourceDir, relPath),
    });
  }

  return assets;
}

// ─── Theme Config ────────────────────────────────────────────────────────────

/**
 * Load theme-level `_config.yml` / `_config.yaml` if present.
 */
async function loadThemeConfig(themeDir: string): Promise<ThemeConfig> {
  const candidates = ['_config.yaml', '_config.yml'];

  for (const name of candidates) {
    const filePath = nodePath.join(themeDir, name);
    try {
      await fs.access(filePath);
      // Use dynamic import to avoid hard dependency on yaml parser
      // The cli package or user will have `yaml` installed
      const raw = await fs.readFile(filePath, 'utf-8');
      try {
        const { parse } = await import('yaml');
        const parsed = parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as ThemeConfig;
        }
      } catch {
        // yaml package not available — skip theme config
      }
      return {};
    } catch {
      // File doesn't exist, try next
    }
  }

  return {};
}

// ─── i18n Loading ────────────────────────────────────────────────────────────

/**
 * Load language files from the theme languages directory.
 * Returns a map of locale → key-value translations.
 */
async function loadLanguages(
  languageDir: string,
): Promise<Record<string, Record<string, unknown>>> {
  const languages: Record<string, Record<string, unknown>> = {};
  const files = await walkDir(languageDir);

  for (const relPath of files) {
    const ext = nodePath.extname(relPath).toLowerCase();
    if (ext !== '.yaml' && ext !== '.yml' && ext !== '.json') continue;

    const locale = stripExt(relPath);
    const filePath = nodePath.join(languageDir, relPath);
    const raw = await fs.readFile(filePath, 'utf-8');

    try {
      if (ext === '.json') {
        languages[locale] = JSON.parse(raw) as Record<string, unknown>;
      } else {
        const { parse } = await import('yaml');
        const parsed = parse(raw);
        if (parsed && typeof parsed === 'object') {
          languages[locale] = parsed as Record<string, unknown>;
        }
      }
    } catch {
      // Skip invalid language files
    }
  }

  return languages;
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function themePlugin(options: ThemeOptions = {}): NeoHexoPlugin {
  const {
    dir = 'theme',
    layoutDir = 'layout',
    sourceDir: _sourceDir = 'source',
    languageDir = 'languages',
  } = options;

  // ── Shared closure state ──
  // apply() runs (step 4) before hooks fire (step 6), so these are
  // guaranteed to be set by the time any hook handler executes.
  let viewRegistry: ViewRegistry;
  let renderPipeline: RenderPipeline;
  let themeDir = '';

  return {
    name: 'neo-hexo:theme',

    apply(ctx: Context) {
      viewRegistry = ctx.inject(ViewRegistryKey);
      renderPipeline = ctx.inject(RenderServiceKey);

      return {
        dispose() {
          viewRegistry.clear();
        },
      };
    },

    hooks: {
      // ── Config Phase: resolve theme dir, load config + i18n ──
      async configLoaded(config: ResolvedConfig) {
        const baseDir = config._baseDir as string;
        themeDir = nodePath.resolve(baseDir, dir);

        // Load and merge theme config
        const themeCfg = await loadThemeConfig(themeDir);
        (config as Record<string, unknown>).theme = {
          ...((config as Record<string, unknown>).theme as Record<string, unknown> ?? {}),
          ...themeCfg,
        };

        // Load languages
        const langDir = nodePath.join(themeDir, languageDir);
        const languages = await loadLanguages(langDir);
        if (Object.keys(languages).length > 0) {
          (config as Record<string, unknown>).__themeLanguages = languages;
        }
      },

      // ── After config is fully resolved: load views into registry ──
      async configResolved(_config: ResolvedConfig) {
        if (!themeDir) return;

        const layoutPath = nodePath.join(themeDir, layoutDir);

        // Create a render function that dispatches to the RenderPipeline
        const renderFn = async (
          source: string,
          ext: string,
          locals: Record<string, unknown>,
        ): Promise<string> => {
          const result = await renderPipeline.render(source, {
            engine: ext,
            ...locals,
          });
          return result.content;
        };

        const views = await loadViews(layoutPath, renderFn);
        for (const view of views) {
          viewRegistry.set(view.name, view);
        }
      },

      // ── Route rendering: resolve layout → render view → afterHtmlRender ──
      async renderRoute(route: Route, locals: TemplateLocals) {
        const layouts = route.layout ?? ['index'];
        const view = viewRegistry.resolve(layouts);

        if (!view) {
          // No matching template — pass through raw data
          return typeof route.data === 'string'
            ? route.data
            : JSON.stringify(route.data);
        }

        const templateData: Record<string, unknown> = {
          ...locals,
          page: route.data,
          layout: layouts[0],
        };

        return view.render(templateData);
      },
    },
  };
}

// ── Exported Utilities ───────────────────────────────────────────────────────

export {
  loadViews,
  loadThemeAssets,
  loadThemeConfig,
  loadLanguages,
  walkDir,
  stripExt,
};

export type { ThemeOptions as Options };
