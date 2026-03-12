/**
 * @neo-hexo/core — Public API
 */

// Hook system
export { Hook, type HookStrategy, type Disposable, type TapOptions } from './hooks.js';

// Plugin system
export { type NeoHexoPlugin, type PluginFactory, sortPlugins } from './plugin.js';

// Service container
export { Context, createServiceKey, type ServiceKey } from './context.js';

// Lifecycle
export {
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
} from './lifecycle.js';

// Config
export {
  defineConfig,
  resolveConfig,
  defaultConfig,
  normalizePluginEntry,
  yamlConfigToUserConfig,
  type UserConfig,
  type YamlConfig,
  type YamlPluginEntry,
  type PluginResolver,
} from './config.js';

// Main class
export { NeoHexo } from './neo-hexo.js';

// ── Phase 3: Core Subsystems ──

// Box (file processor)
export { Box, type ProcessorFn, type ProcessorEntry, type FileCacheEntry } from './box.js';

// Router
export { Router, RouterServiceKey, type RouteData, type RouteDataInput } from './router.js';

// Render pipeline
export {
  RenderPipeline,
  RenderServiceKey,
  createRenderPipeline,
  type Renderer,
  type RenderOptions,
  type RenderResult,
} from './render.js';

// Post processing
export {
  PostProcessor,
  PostServiceKey,
  createPostProcessor,
  type CreatePostOptions,
  type RenderPostOptions,
  type FrontMatterParser,
  type ContentRenderer,
} from './post.js';

// Scaffold
export {
  ScaffoldManager,
  ScaffoldServiceKey,
  createScaffoldManager,
  type ScaffoldEntry,
} from './scaffold.js';

// Helper registry
export {
  HelperRegistry,
  HelperRegistryKey,
  type HelperFn,
} from './helper-registry.js';

// Command registry
export {
  CommandRegistry,
  CommandRegistryKey,
  type CommandArgs,
  type CommandHandler,
  type CommandEntry,
} from './command-registry.js';

// View registry
export {
  ViewRegistry,
  ViewRegistryKey,
  type View,
  type ViewResolver,
} from './view-registry.js';
