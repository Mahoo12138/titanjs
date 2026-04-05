/**
 * Block system types - Unified model for Widgets and Slot Components
 *
 * A Block is a reusable UI building block that can appear in:
 * - Sidebar regions (like the old Widget)
 * - Named slot anchor points in layouts (like the old SlotComponent)
 *
 * Each Block has:
 * - A Zod config schema (validated at startup)
 * - An optional `prefetch` data loader (async, runs during Generate stage)
 * - A `render` function (Preact component, SSR)
 * - An optional `guard` for conditional rendering
 * - Optional Island activation for client-side hydration
 */
import type { z } from 'zod'
import type { SiteData, BaseEntry } from './content.js'
import type { Route } from './route.js'
import type { IslandDefinition, SiteContext } from './theme.js'

// ── Block Definition ──

export interface BlockDefinition<TConfig = unknown, TData = unknown> {
  /** Unique block name (e.g. 'toc', 'comments', 'recent-posts') */
  name: string

  /** Zod schema for block instance configuration */
  configSchema: z.ZodType<TConfig>

  /**
   * Slot anchor points this block can appear in.
   * If omitted, the block can only appear in siteTree sidebars.
   */
  slots?: string[]

  /**
   * Async data loader invoked during the Generate stage.
   * Result is injected into render via `ctx.data`.
   */
  prefetch?: (ctx: BlockPrefetchContext<TConfig>) => Promise<TData>

  /**
   * Preact component that renders this block (SSR).
   */
  render: (ctx: BlockRenderContext<TConfig, TData>) => any

  /**
   * Conditional rendering guard. Return false to skip this block.
   */
  guard?: (ctx: BlockGuardContext<TConfig>) => boolean

  /** Island activation config for client-side hydration */
  island?: IslandDefinition

  /** Sort order within a slot (lower = earlier). Default: 100 */
  order?: number
}

// ── Block Contexts ──

export interface BlockPrefetchContext<TConfig> {
  config: TConfig
  siteData: SiteData
  route: Route
  entry?: BaseEntry
}

export interface BlockRenderContext<TConfig, TData> {
  config: TConfig
  data: TData
  route: Route
  entry?: BaseEntry
  site: SiteContext
}

export interface BlockGuardContext<TConfig> {
  config: TConfig
  entry?: BaseEntry
  route: Route
}

// ── Block Registry interface ──

/**
 * Interface for the block registry, used as a contract between core and types.
 * The concrete implementation lives in @titan/core.
 */
export interface BlockRegistry {
  register(def: BlockDefinition<any, any>): void
  get(name: string): BlockDefinition<any, any> | undefined
  has(name: string): boolean
  getAll(): BlockDefinition<any, any>[]
  /** Get blocks that declare they can appear in the given slot, sorted by order */
  getBlocksForSlot(slotName: string): BlockDefinition<any, any>[]
  /** Resolve and validate a block's config using its Zod schema */
  resolveConfig(blockName: string, overrides?: Record<string, unknown>): unknown
}

// ── Helper function ──

export function defineBlock<TConfig = unknown, TData = unknown>(
  def: BlockDefinition<TConfig, TData>,
): BlockDefinition<TConfig, TData> {
  return def
}
