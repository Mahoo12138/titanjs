// @titan/core - Core engine for Titan SSG

// Phase 1
export { Pipeline, compose } from './pipeline.js'
export type { MiddlewareTiming } from './pipeline.js'
export { loadSourceFiles, loadFile } from './loader.js'
export { createMarkdownProcessor, transformEntry } from './transformer.js'
export { buildSiteData, generateRoutes, buildGenerateContext } from './generator.js'
export { emitRoutes, renderRoutes } from './emitter.js'
export { defineConfig, loadConfig } from './config.js'
export { FileSystemCache } from './cache.js'
export { Engine } from './engine.js'
export type { EngineOptions, BuildResult, LoadResult, TransformResult, GenerateResult, ThemeResult } from './engine.js'
export type { EmitterOptions } from './emitter.js'
export type { LoaderOptions } from './loader.js'

// Phase 2
export { CollectionRegistry } from './collection-registry.js'
export { SingletonRegistry } from './singleton-registry.js'
export { definePlugin } from './plugin.js'
export { buildExecutionPlan, executePluginPlan } from './ioc.js'
export type { PluginNode, ExecutionPlan } from './ioc.js'
export { DependencyTracker, hashFile, hashData, buildRouteDependencyIndex, collectAffectedRoutes } from './dependency-tracker.js'
export type { EntryDependencies, DependencyManifest, RouteDependencyIndex } from './dependency-tracker.js'

// Dev Server
export { DevSession } from './dev-session.js'
export type { DevSessionOptions, FileChangeResult, DevSessionStats } from './dev-session.js'

// Widget system (deprecated — use Block system)
export { WidgetRegistry } from './widget-registry.js'

// Block system (unified replacement for Widgets + Slot Components)
export { BlockRegistry } from './block-registry.js'

// Extracted managers
export { PluginManager } from './plugin-manager.js'
export type { Pipelines } from './plugin-manager.js'
export { StyleManager } from './style-manager.js'

// Event system
export { TitanEventEmitter } from './event-emitter.js'
export type { TitanEventMap, TitanEventName, TitanEventHandler } from './event-emitter.js'

// Phase 3 - Theme system
export { loadTheme, resolveLayout } from './theme-loader.js'
export { renderLayout, Slot, buildHtmlDocument } from './renderer.js'
export type { IslandInstance, RenderResult } from './renderer.js'
export { emitRoutesWithTheme, renderRoutesWithTheme } from './theme-emitter.js'
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
