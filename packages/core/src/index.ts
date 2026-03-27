// @titan/core - Core engine for Titan SSG

// Phase 1
export { Pipeline, compose } from './pipeline.js'
export { loadSourceFiles, loadFile } from './loader.js'
export { createMarkdownProcessor, transformEntry } from './transformer.js'
export { buildSiteData, generateRoutes, buildGenerateContext } from './generator.js'
export { emitRoutes } from './emitter.js'
export { defineConfig, loadConfig } from './config.js'
export { FileSystemCache } from './cache.js'
export { Engine } from './engine.js'
export type { EngineOptions, BuildResult } from './engine.js'
export type { EmitterOptions } from './emitter.js'
export type { LoaderOptions } from './loader.js'

// Phase 2
export { CollectionRegistry } from './collection-registry.js'
export { SingletonRegistry } from './singleton-registry.js'
export { definePlugin } from './plugin.js'
export { buildExecutionPlan, executePluginPlan } from './ioc.js'
export type { PluginNode, ExecutionPlan } from './ioc.js'
export { DependencyTracker, hashFile, hashData } from './dependency-tracker.js'
export type { EntryDependencies, DependencyManifest } from './dependency-tracker.js'

// Widget system
export { WidgetRegistry } from './widget-registry.js'

// Phase 3 - Theme system
export { loadTheme, resolveLayout } from './theme-loader.js'
export { renderLayout, Slot, buildHtmlDocument } from './renderer.js'
export type { IslandInstance, RenderResult } from './renderer.js'
export { emitRoutesWithTheme } from './theme-emitter.js'
export type { ThemeEmitterOptions } from './theme-emitter.js'

// Phase 4 - Style system
export {
  buildStyles,
  loadFrameworkBase,
  loadThemeGlobalStyles,
  validateTokenCompleteness,
  lintPluginCSS,
  scopeCSS,
  extractAssignedTokens,
  generateUserTokenOverrides,
  DESIGN_TOKENS,
} from './styles.js'
export type {
  StyleLayers,
  ResolvedStyles,
  CSSLintViolation,
  BuildStylesOptions,
} from './styles.js'
