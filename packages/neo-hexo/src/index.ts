/**
 * neo-hexo — Meta Package
 *
 * Re-exports the public API from @neo-hexo/core and @neo-hexo/cli
 * so end-users only need a single dependency.
 */

// ── Core API ─────────────────────────────────────────────────────────────────
export {
  // Config
  defineConfig,
  resolveConfig,
  defaultConfig,
  normalizePluginEntry,
  yamlConfigToUserConfig,
  type UserConfig,
  type YamlConfig,
  type YamlPluginEntry,
  type PluginResolver,

  // Hooks
  Hook,
  type HookStrategy,
  type Disposable,
  type TapOptions,

  // Plugin
  type NeoHexoPlugin,
  type PluginFactory,
  sortPlugins,

  // Context
  Context,
  createServiceKey,
  type ServiceKey,

  // Lifecycle
  createLifecycleHooks,
  type LifecycleHooks,
  type LifecycleHookInstances,
  type ResolvedConfig,
  type SourceFile,
  type PostData,
  type RenderData,
  type Route,
  type SiteLocals,
  type TemplateLocals,

  // Main class
  NeoHexo,

  // Box
  Box,
  type ProcessorFn,
  type ProcessorEntry,
  type FileCacheEntry,

  // Router
  Router,
  RouterServiceKey,
  type RouteData,
  type RouteDataInput,

  // Render
  RenderPipeline,
  RenderServiceKey,
  createRenderPipeline,
  type Renderer,
  type RenderOptions,
  type RenderResult,

  // Post
  PostProcessor,
  PostServiceKey,
  createPostProcessor,
  type CreatePostOptions,
  type RenderPostOptions,
  type FrontMatterParser,
  type ContentRenderer,

  // Scaffold
  ScaffoldManager,
  ScaffoldServiceKey,
  createScaffoldManager,
  type ScaffoldEntry,

  // Helper registry
  HelperRegistry,
  HelperRegistryKey,
  type HelperFn,

  // Command registry
  CommandRegistry,
  CommandRegistryKey,
  type CommandArgs,
  type CommandHandler,
  type CommandEntry,

  // View registry
  ViewRegistry,
  ViewRegistryKey,
  type View,
  type ViewResolver,
} from '@neo-hexo/core';

// ── CLI API ──────────────────────────────────────────────────────────────────
export {
  bootstrap,
  run,
  loadConfig,
  findConfigFile,
  loadConfigFile,
  createPluginResolver,
  BUILTIN_PLUGINS,
  getBuiltinPluginNames,
} from '@neo-hexo/cli';

// ── Theme API ────────────────────────────────────────────────────────────────
export {
  default as themePlugin,
  loadViews,
  loadThemeAssets,
  loadThemeConfig,
  loadLanguages,
  walkDir,
  stripExt,
  type ThemeOptions,
  type ThemeConfig,
} from '@neo-hexo/theme';
