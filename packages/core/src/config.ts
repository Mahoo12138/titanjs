/**
 * @neo-hexo/core — Configuration System
 *
 * Supports two config modes:
 *   1. **YAML config** (`neo-hexo.yaml`) — declarative, static configuration.
 *      Plugins are listed by name and resolved at load time.
 *   2. **Programmatic config** — via `defineConfig()` for testing and advanced use.
 */

import type { NeoHexoPlugin } from './plugin.js';
import type { ResolvedConfig } from './lifecycle.js';

// ─── YAML Config (what users write in neo-hexo.yaml) ─────────────────────────

/**
 * Plugin entry in YAML config.
 * Can be a simple string name or an object with name + options.
 *
 * ```yaml
 * plugins:
 *   - renderer-markdown           # shorthand
 *   - name: highlight             # with options
 *     theme: github-dark
 *     lineNumbers: true
 *   - name: deployer-git
 *     repo: https://github.com/user/repo.git
 *     branch: gh-pages
 * ```
 */
export type YamlPluginEntry = string | { name: string; [key: string]: unknown };

/**
 * The raw shape of a `neo-hexo.yaml` config file (after YAML parsing).
 */
export interface YamlConfig {
  /** Site title. */
  title?: string;
  /** Site subtitle. */
  subtitle?: string;
  /** Site description. */
  description?: string;
  /** Site author. */
  author?: string;
  /** Site language. */
  language?: string | string[];
  /** Timezone (IANA). */
  timezone?: string;
  /** Site URL. */
  url?: string;
  /** Root path (default: '/'). */
  root?: string;

  // ── Directories ──
  sourceDir?: string;
  publicDir?: string;
  themeDir?: string;

  // ── Build ──
  permalink?: string;
  defaultLayout?: string;
  titlecase?: boolean;

  // ── Database ──
  database?: {
    adapter?: 'json' | 'sqlite';
    path?: string;
  };

  // ── Plugins (by name) ──
  plugins?: YamlPluginEntry[];

  // ── Theme config ──
  theme?: Record<string, unknown>;

  /** Catch-all for user extensions. */
  [key: string]: unknown;
}

// ─── Programmatic Config (for testing / advanced use) ─────────────────────────

export interface UserConfig {
  /** Site title. */
  title?: string;
  /** Site subtitle. */
  subtitle?: string;
  /** Site description. */
  description?: string;
  /** Site author. */
  author?: string;
  /** Site language. */
  language?: string | string[];
  /** Timezone (IANA). */
  timezone?: string;
  /** Site URL. */
  url?: string;
  /** Root path (default: '/'). */
  root?: string;

  // ── Directories ──
  /** Source files directory (default: 'source'). */
  sourceDir?: string;
  /** Public output directory (default: 'public'). */
  publicDir?: string;
  /** Theme directory or name. */
  themeDir?: string;

  // ── Build ──
  /** Post permalink pattern (default: ':year/:month/:day/:title/'). */
  permalink?: string;
  /** Default layout for new posts. */
  defaultLayout?: string;
  /** Whether to title-case post titles. */
  titlecase?: boolean;

  // ── Database ──
  database?: {
    adapter?: 'json' | 'sqlite';
    path?: string;
  };

  // ── Plugins (resolved instances for programmatic use) ──
  plugins?: NeoHexoPlugin[];

  // ── Theme config ──
  theme?: Record<string, unknown>;

  /** Catch-all for user extensions. */
  [key: string]: unknown;
}

// ─── Default Config ──────────────────────────────────────────────────────────

export const defaultConfig: Required<
  Pick<UserConfig, 'title' | 'subtitle' | 'description' | 'author' | 'language' | 'timezone' | 'url' | 'root' | 'sourceDir' | 'publicDir' | 'permalink' | 'defaultLayout' | 'titlecase'>
> & { database: { adapter: 'json' | 'sqlite'; path: string } } = {
  title: 'Neo-Hexo Site',
  subtitle: '',
  description: '',
  author: '',
  language: 'en',
  timezone: '',
  url: 'http://localhost',
  root: '/',
  sourceDir: 'source',
  publicDir: 'public',
  permalink: ':year/:month/:day/:title/',
  defaultLayout: 'post',
  titlecase: false,
  database: {
    adapter: 'json',
    path: 'db.json',
  },
};

// ─── Config Resolution ──────────────────────────────────────────────────────

/**
 * `defineConfig()` — identity helper for programmatic config.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config;
}

/**
 * Merge user config with defaults to produce a fully resolved config.
 */
export function resolveConfig(userConfig: UserConfig, baseDir: string): ResolvedConfig {
  const merged = {
    ...defaultConfig,
    ...userConfig,
    database: {
      ...defaultConfig.database,
      ...userConfig.database,
    },
  };

  // Resolve directories to absolute paths relative to baseDir
  // (actual path resolution deferred to @neo-hexo/fs phase)
  return {
    ...merged,
    _baseDir: baseDir,
  } as ResolvedConfig;
}

// ─── Plugin Resolution ───────────────────────────────────────────────────────

/**
 * A plugin resolver maps a plugin name (from YAML config) to a NeoHexoPlugin instance.
 * The CLI package registers resolvers; core provides the interface.
 */
export type PluginResolver = (
  name: string,
  options: Record<string, unknown>,
) => NeoHexoPlugin | Promise<NeoHexoPlugin>;

/**
 * Normalize a YAML plugin entry to { name, options }.
 */
export function normalizePluginEntry(
  entry: YamlPluginEntry,
): { name: string; options: Record<string, unknown> } {
  if (typeof entry === 'string') {
    return { name: entry, options: {} };
  }
  const { name, ...options } = entry;
  return { name, options };
}

/**
 * Convert a YAML config to a UserConfig by resolving plugins via a resolver function.
 */
export async function yamlConfigToUserConfig(
  yaml: YamlConfig,
  resolver: PluginResolver,
): Promise<UserConfig> {
  const { plugins: yamlPlugins, ...rest } = yaml;

  const plugins: NeoHexoPlugin[] = [];
  if (yamlPlugins) {
    for (const entry of yamlPlugins) {
      const { name, options } = normalizePluginEntry(entry);
      const plugin = await resolver(name, options);
      plugins.push(plugin);
    }
  }

  return { ...rest, plugins };
}
