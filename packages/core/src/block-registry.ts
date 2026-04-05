/**
 * Block Registry - Unified registry for Blocks (replaces WidgetRegistry + slot components)
 *
 * Blocks are the unified model for sidebar widgets and slot-injected components.
 * This registry manages block definitions, config resolution, slot queries,
 * and batch prefetch execution during the Generate stage.
 */
import type {
  BlockDefinition,
  SiteTree,
  WidgetsConfig,
  SidebarConfig,
  SiteData,
  Route,
  BaseEntry,
  SiteContext,
} from '@titan/types'

export class BlockRegistry {
  private definitions = new Map<string, BlockDefinition<any, any>>()
  private siteTree: SiteTree = {}
  private blocksConfig: WidgetsConfig = {}

  /**
   * Register a block definition.
   */
  register(def: BlockDefinition<any, any>): void {
    if (this.definitions.has(def.name)) {
      throw new Error(`Block "${def.name}" is already registered`)
    }
    this.definitions.set(def.name, def)
  }

  /**
   * Register multiple block definitions.
   */
  registerAll(defs: BlockDefinition<any, any>[]): void {
    for (const def of defs) {
      this.register(def)
    }
  }

  /**
   * Set the site tree configuration (sidebar layout mapping).
   */
  setSiteTree(tree: SiteTree): void {
    this.siteTree = tree
  }

  /**
   * Set default block instance configs.
   */
  setBlocksConfig(config: WidgetsConfig): void {
    this.blocksConfig = config
  }

  /**
   * Get a block definition by name.
   */
  get(name: string): BlockDefinition<any, any> | undefined {
    return this.definitions.get(name)
  }

  /**
   * Check if a block is registered.
   */
  has(name: string): boolean {
    return this.definitions.has(name)
  }

  /**
   * Get all registered block definitions.
   */
  getAll(): BlockDefinition<any, any>[] {
    return Array.from(this.definitions.values())
  }

  /**
   * Get blocks that declare they can appear in the given slot, sorted by order.
   * Replaces the old theme-loader collectSlotComponents logic.
   */
  getBlocksForSlot(slotName: string): BlockDefinition<any, any>[] {
    return [...this.definitions.values()]
      .filter(b => b.slots?.includes(slotName))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  /**
   * Resolve sidebar block names for a given layout type.
   *
   * Priority: page frontmatter override > site tree config > empty
   */
  resolveSidebar(
    side: 'leftbar' | 'rightbar',
    layoutType: string,
    frontmatterOverride?: SidebarConfig,
  ): string[] {
    // 1. Frontmatter explicit override
    if (frontmatterOverride !== undefined) {
      return frontmatterOverride ?? []
    }

    // 2. SiteTree config for this layout type
    const layoutConfig = this.siteTree[layoutType]
    if (layoutConfig) {
      const sidebar = layoutConfig[side]
      if (sidebar !== undefined) {
        return sidebar ?? []
      }
    }

    // 3. Fallback to home config (for index-like pages)
    if (layoutType !== 'home' && this.siteTree.home) {
      const homeSidebar = this.siteTree.home[side]
      if (homeSidebar !== undefined) {
        return homeSidebar ?? []
      }
    }

    return []
  }

  /**
   * Validate and resolve a block's config using its Zod schema.
   * Merges default blocksConfig with any per-instance overrides.
   */
  resolveConfig(
    blockName: string,
    overrides?: Record<string, unknown>,
  ): unknown {
    const def = this.definitions.get(blockName)
    if (!def) return overrides ?? {}

    const defaults = this.blocksConfig[blockName] ?? {}
    const merged = { ...defaults, ...overrides }

    const result = def.configSchema.safeParse(merged)
    if (!result.success) {
      console.warn(
        `[block] Config validation failed for "${blockName}": ${result.error.issues.map(i => i.message).join(', ')}`,
      )
      // Return merged without validation on failure (best-effort)
      return merged
    }

    return result.data
  }

  /**
   * Batch execute prefetch for all blocks that have a prefetch function.
   * Returns a Map keyed by "blockName::routeUrl" → prefetched data.
   *
   * Called during the Generate stage, after routes are computed.
   */
  async prefetchAll(
    routes: Route[],
    siteData: SiteData,
  ): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>()

    for (const def of this.definitions.values()) {
      if (!def.prefetch) continue

      const config = this.resolveConfig(def.name)

      await Promise.all(routes.map(async route => {
        const data = await def.prefetch!({ config, siteData, route })
        results.set(`${def.name}::${route.url}`, data)
      }))
    }

    return results
  }
}
