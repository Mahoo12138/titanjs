/**
 * Widget Registry - Manages widget definitions and their resolution
 *
 * Analogous to CollectionRegistry: widgets are registered by themes and plugins,
 * then resolved at render time with per-instance configuration validated by Zod.
 */
import type {
  WidgetDefinition,
  WidgetContext,
  WidgetSiteContext,
  WidgetDataLoaderContext,
  SiteTree,
  WidgetsConfig,
  SidebarConfig,
  BaseEntry,
  SiteData,
  Route,
} from '@titan/types'

export class WidgetRegistry {
  private definitions = new Map<string, WidgetDefinition<any>>()
  private siteTree: SiteTree = {}
  private widgetsConfig: WidgetsConfig = {}

  /**
   * Register a widget definition
   */
  register(def: WidgetDefinition<any>): void {
    if (this.definitions.has(def.name)) {
      throw new Error(`Widget "${def.name}" is already registered`)
    }
    this.definitions.set(def.name, def)
  }

  /**
   * Register multiple widget definitions
   */
  registerAll(defs: WidgetDefinition<any>[]): void {
    for (const def of defs) {
      this.register(def)
    }
  }

  /**
   * Set the site tree configuration (sidebar layout mapping)
   */
  setSiteTree(tree: SiteTree): void {
    this.siteTree = tree
  }

  /**
   * Set default widget instance configs
   */
  setWidgetsConfig(config: WidgetsConfig): void {
    this.widgetsConfig = config
  }

  /**
   * Get a widget definition by name
   */
  get(name: string): WidgetDefinition<any> | undefined {
    return this.definitions.get(name)
  }

  /**
   * Check if a widget is registered
   */
  has(name: string): boolean {
    return this.definitions.has(name)
  }

  /**
   * Get all registered widget names
   */
  getAll(): WidgetDefinition<any>[] {
    return Array.from(this.definitions.values())
  }

  /**
   * Resolve sidebar widget names for a given layout type.
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
   * Validate and resolve a widget's config using its Zod schema.
   * Merges default widgetsConfig with any per-instance overrides.
   */
  resolveWidgetConfig(
    widgetName: string,
    overrides?: Record<string, unknown>,
  ): unknown {
    const def = this.definitions.get(widgetName)
    if (!def) return overrides ?? {}

    const defaults = this.widgetsConfig[widgetName] ?? {}
    const merged = { ...defaults, ...overrides }

    const result = def.configSchema.safeParse(merged)
    if (!result.success) {
      console.warn(
        `[widget] Config validation failed for "${widgetName}": ${result.error.issues.map(i => i.message).join(', ')}`,
      )
      // Return merged without validation on failure (best-effort)
      return merged
    }

    return result.data
  }

  /**
   * Build a WidgetContext for rendering a widget
   */
  buildWidgetContext(
    widgetName: string,
    siteContext: WidgetSiteContext,
    route: Route,
    entry?: BaseEntry,
    configOverrides?: Record<string, unknown>,
  ): WidgetContext<any> | null {
    const def = this.definitions.get(widgetName)
    if (!def) return null

    const config = this.resolveWidgetConfig(widgetName, configOverrides)

    let data: unknown
    if (def.dataLoader) {
      data = def.dataLoader({ siteData: siteContext.data, route, entry })
    }

    return {
      config,
      route,
      entry,
      site: siteContext,
      data,
    }
  }
}
