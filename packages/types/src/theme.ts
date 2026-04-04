/**
 * Theme system types
 *
 * Defines the contracts for:
 * - Theme configuration (defineTheme)
 * - Layout modules
 * - Page contexts injected into layouts
 * - Slot system (defineSlot, SlotComponentDefinition)
 * - Island activation strategies
 */
import type { z } from 'zod'
import type { BaseEntry, Post, Page, SiteData, Collection, Tag, Category, Heading } from './content.js'
import type { Route, Pagination } from './route.js'
import type { WidgetDefinition, SiteTree, WidgetsConfig, WidgetRegistry } from './widget.js'

// ── Theme Definition ──

export interface ThemeDefinition {
  name: string
  version?: string
  /** Slot declarations */
  slots?: Record<string, SlotDefinition>
  /** Theme config schema (Zod) */
  config?: z.ZodType<any>
  /** Enable View Transitions */
  viewTransitions?: boolean
  /** Content type → layout name mapping */
  typeLayoutMap?: Record<string, string>
  /** Widget definitions provided by this theme */
  widgets?: WidgetDefinition<any>[]
  /** SiteTree: per-layout sidebar widget configuration */
  siteTree?: SiteTree
  /** Default widget instance configs */
  widgetsConfig?: WidgetsConfig
}

// ── Slot System ──

export interface SlotDefinition {
  description?: string
  /** Props schema for the slot */
  props?: z.ZodType<any>
  /** How multiple components are composed */
  mode: 'stack' | 'replace'
}

export interface SlotComponentDefinition {
  /** Target slot name */
  slot: string
  /** Preact component function */
  component: (props: any) => any
  /** Component-scoped styles */
  styles?: () => Promise<any>
  /** Island activation config */
  island?: IslandDefinition
  /** Sort order within the slot (lower = earlier) */
  order?: number
}

export interface IslandDefinition {
  /** The client-side component module */
  component: () => Promise<any>
  /** Activation strategy */
  activate: 'client:load' | 'client:visible' | 'client:idle'
}

// ── Resolved Theme (after loading) ──

export interface ResolvedTheme {
  /** Theme definition from theme.config.ts */
  definition: ThemeDefinition
  /** Resolved theme config values (validated by Zod) */
  config: Record<string, unknown>
  /** Layout modules keyed by name */
  layouts: Map<string, LayoutModule>
  /** Slot components grouped by slot name, sorted by order */
  slotComponents: Map<string, SlotComponentDefinition[]>
  /** Content type → layout name mapping (merged from theme + plugins) */
  typeLayoutMap: Record<string, string>
  /** Theme root directory */
  rootDir: string
  /** Widget registry for sidebar resolution */
  widgetRegistry?: WidgetRegistry
  /** Inlined CSS from the theme's style.css (legacy, used as fallback) */
  styles?: string
  /** Processed style layers from the 5-layer system */
  resolvedStyles?: ResolvedStyleOutput
}

/** Output of the style system's buildStyles() */
export interface ResolvedStyleOutput {
  /** All layers merged into one CSS string */
  css: string
  /** Validation warnings (non-fatal) */
  warnings: string[]
}

/** Union of all page context types that layouts can receive */
export type LayoutProps = PageContext | PostContext | PageLayoutContext | ListContext | CollectionItemContext

export interface LayoutModule {
  /** The default export is a Preact component that receives a page context */
  default: (props: LayoutProps) => any
}

// ── Page Contexts ──

export interface SiteContext {
  title: string
  url: string
  language: string
  data: SiteData
}

/** Base context shared by all layouts */
export interface PageContext {
  site: SiteContext
  theme: Record<string, unknown>
  route: Route
  pagination?: Pagination
}

/** Context for post layouts */
export interface PostContext extends PageContext {
  post: Post
}

/** Context for page layouts */
export interface PageLayoutContext extends PageContext {
  page: Page
}

/** Context for list layouts (index, tag, category) */
export interface ListContext extends PageContext {
  posts: Post[]
  tag?: Tag
  category?: Category
}

/** Context for custom collection item layouts */
export interface CollectionItemContext extends PageContext {
  entry: BaseEntry
  collection: string
}

// ── Helper Functions ──

export function defineTheme(def: ThemeDefinition): ThemeDefinition {
  return def
}

export function defineSlot(def: SlotDefinition): SlotDefinition {
  return def
}

export function defineSlotComponent(def: SlotComponentDefinition): SlotComponentDefinition {
  return def
}
