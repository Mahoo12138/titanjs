/**
 * Widget system types
 *
 * @deprecated Use BlockDefinition from './block.js' instead.
 * This module is retained for backward compatibility and will be removed
 * in a future major version. All new code should use defineBlock().
 *
 * Widgets are reusable UI blocks rendered in sidebars or other layout regions.
 * Themes declare built-in widgets; plugins can register additional widgets
 * via defineWidget() + TypeScript Declaration Merging on WidgetMap.
 */
import type { z } from 'zod'
import type { SiteData, BaseEntry, Post } from './content.js'
import type { Route } from './route.js'

// ── Widget Definition ──

/** @deprecated Use BlockDefinition from './block.js' instead */
export interface WidgetDefinition<TConfig = unknown> {
  /** Unique widget name (e.g. 'toc', 'recent', 'author') */
  name: string
  /** Preact component that renders this widget */
  component: (props: WidgetContext<TConfig>) => any
  /** Zod schema for widget instance configuration */
  configSchema: z.ZodType<TConfig>
  /**
   * Optional data loader invoked during the Generate stage.
   * Returns data that will be passed to the component via `ctx.data`.
   */
  dataLoader?: (ctx: WidgetDataLoaderContext) => unknown
}

/** Context passed to a widget component during SSR */
export interface WidgetContext<TConfig = unknown> {
  /** Validated widget instance config */
  config: TConfig
  /** Current page route */
  route: Route
  /** Current entry (post/page/custom) if on a content page */
  entry?: BaseEntry
  /** Full site data for queries */
  site: WidgetSiteContext
  /** Data returned by the widget's dataLoader (if any) */
  data?: unknown
}

export interface WidgetSiteContext {
  title: string
  url: string
  language: string
  data: SiteData
}

/** Context passed to a widget's dataLoader function */
export interface WidgetDataLoaderContext {
  siteData: SiteData
  route: Route
  entry?: BaseEntry
}

// ── Sidebar & SiteTree ──

/** A sidebar is an ordered list of widget instance references */
export type SidebarConfig = string[] | null

/** Per-layout sidebar configuration */
export interface LayoutSidebarConfig {
  leftbar?: SidebarConfig
  rightbar?: SidebarConfig
}

/**
 * SiteTree: maps page layout types to their sidebar widget configuration.
 * Mirrors Stellar's `site_tree` config concept.
 */
export interface SiteTree {
  home?: LayoutSidebarConfig
  post?: LayoutSidebarConfig
  page?: LayoutSidebarConfig
  archive?: LayoutSidebarConfig
  tag?: LayoutSidebarConfig
  category?: LayoutSidebarConfig
  /** Extensible: plugins add custom layout keys */
  [layout: string]: LayoutSidebarConfig | undefined
}

// ── Widget Instance Config ──

/**
 * Widgets config in theme: maps widget name → widget instance options.
 * Each entry corresponds to a configured widget that can be placed in sidebars.
 */
export type WidgetsConfig = Record<string, Record<string, unknown>>

// ── Declaration Merging target ──

/**
 * Plugins and themes extend this interface via Declaration Merging
 * to register new widget types with their config shapes.
 *
 * Example:
 *   declare module '@titan/types' {
 *     interface WidgetMap {
 *       'my-widget': { title: string; limit: number }
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface WidgetMap {}

// ── Widget Registry interface ──

/**
 * Interface for the widget registry, used as a contract between core and types.
 * The concrete implementation lives in @titan/core.
 */
export interface WidgetRegistry {
  get(name: string): WidgetDefinition<any> | undefined
  has(name: string): boolean
  getAll(): WidgetDefinition<any>[]
  resolveSidebar(
    side: 'leftbar' | 'rightbar',
    layoutType: string,
    frontmatterOverride?: SidebarConfig,
  ): string[]
  resolveWidgetConfig(
    widgetName: string,
    overrides?: Record<string, unknown>,
  ): unknown
  buildWidgetContext(
    widgetName: string,
    siteContext: WidgetSiteContext,
    route: Route,
    entry?: BaseEntry,
    configOverrides?: Record<string, unknown>,
  ): WidgetContext<any> | null
}

// ── Helper function ──

/** @deprecated Use defineBlock() from './block.js' instead */
export function defineWidget<TConfig = unknown>(
  def: WidgetDefinition<TConfig>,
): WidgetDefinition<TConfig> {
  return def
}
