/**
 * Renderer - Preact SSR with Slot injection and Island collection
 *
 * Responsibilities:
 * - Render layout component to HTML string via preact-render-to-string
 * - Provide <Slot> component that renders block/slot components in-place
 * - Collect Island components for deferred client-side hydration
 * - Generate full HTML document with Island activation scripts
 */
import { h, Fragment, type VNode, type ComponentType, createContext } from 'preact'
import { useContext } from 'preact/hooks'
import renderToString from 'preact-render-to-string'
import type {
  ResolvedTheme,
  LayoutModule,
  PageContext,
  SlotComponentDefinition,
  IslandDefinition,
  BlockDefinition,
  Route,
} from '@titan/types'
import type { BlockRegistry } from './block-registry.js'

export interface IslandInstance {
  /** Unique ID for the island element */
  id: string
  /** Component name (for chunk reference) */
  name: string
  /** Activation strategy */
  activate: 'client:load' | 'client:visible' | 'client:idle'
  /** Serialized props */
  props?: Record<string, unknown>
}

export interface RenderResult {
  /** Full HTML string */
  html: string
  /** Collected island instances for client hydration */
  islands: IslandInstance[]
}

/**
 * Render context for SSR. Passed via Preact Context instead of module-level globals
 * to ensure safe concurrent rendering.
 */
interface RenderContextValue {
  theme: ResolvedTheme
  islands: IslandInstance[]
  islandCounter: number
  /** Block registry for slot queries (new unified model) */
  blockRegistry?: BlockRegistry
  /** Prefetched block data keyed by "blockName::routeUrl" */
  blockData?: Map<string, unknown>
  /** Current route (needed for block data lookup) */
  route?: Route
}

const RenderContext = createContext<RenderContextValue | null>(null)

/**
 * Slot component - renders blocks/components registered to the named slot
 *
 * New behavior: queries BlockRegistry for blocks targeting this slot.
 * Falls back to legacy slotComponents map if no BlockRegistry is available.
 *
 * Usage in layouts:
 *   <Slot name="post:after-content" props={{ post, site }} />
 */
export function Slot({ name, props }: { name: string; props?: Record<string, unknown> }): VNode | null {
  const renderCtx = useContext(RenderContext)
  if (!renderCtx) return null

  // ── New path: use BlockRegistry ──
  if (renderCtx.blockRegistry) {
    const blocks = renderCtx.blockRegistry.getBlocksForSlot(name)
    if (blocks.length === 0) return null

    const route = renderCtx.route
    const children = blocks
      .filter(b => {
        if (!b.guard) return true
        const config = renderCtx.blockRegistry!.resolveConfig(b.name)
        return b.guard({ config, entry: props?.entry as any, route: route! })
      })
      .map((b, i) => {
        const config = renderCtx.blockRegistry!.resolveConfig(b.name)
        const data = renderCtx.blockData?.get(`${b.name}::${route?.url}`)
        const vnode = b.render({ config, data, route: route!, entry: props?.entry as any, site: props?.site as any })

        // Collect island if declared
        if (b.island) {
          const islandId = `island-${renderCtx.islandCounter++}`
          renderCtx.islands.push({
            id: islandId,
            name: b.name.replace(/:/g, '-'),
            activate: b.island.activate,
            props,
          })

          return h('div', {
            'data-titan-island': islandId,
            'data-activate': b.island.activate,
            key: `island-${name}-${i}`,
          }, vnode)
        }

        return h(Fragment, { key: `block-${name}-${i}` }, vnode)
      })

    return children.length > 0 ? h(Fragment, null, ...children) : null
  }

  // ── Legacy path: use slotComponents map ──
  const components = renderCtx.theme.slotComponents.get(name)
  if (!components || components.length === 0) return null

  const children = components.map((sc, i) => {
    const vnode = h(sc.component as ComponentType, { ...props, key: `slot-${name}-${i}` })

    // Collect island if declared
    if (sc.island) {
      const islandId = `island-${renderCtx.islandCounter++}`
      renderCtx.islands.push({
        id: islandId,
        name: sc.slot.replace(/:/g, '-'),
        activate: sc.island.activate,
        props,
      })

      return h('div', {
        'data-titan-island': islandId,
        'data-activate': sc.island.activate,
        key: `island-${name}-${i}`,
      }, vnode)
    }

    return vnode
  })

  return h(Fragment, null, ...children)
}

/**
 * Render a layout with Preact SSR
 */
export function renderLayout(
  layout: LayoutModule,
  ctx: PageContext,
  theme: ResolvedTheme,
): RenderResult {
  const islands: IslandInstance[] = []

  const renderCtxValue: RenderContextValue = {
    theme,
    islands,
    islandCounter: 0,
    blockRegistry: theme.blockRegistry as BlockRegistry | undefined,
    blockData: theme.blockData,
    route: ctx.route,
  }

  // Wrap layout in RenderContext.Provider for Slot access
  const vnode = h(
    RenderContext.Provider,
    { value: renderCtxValue },
    h(layout.default, ctx),
  )
  const body = renderToString(vnode)
  return { html: body, islands }
}

/**
 * Build a full HTML document from a rendered body
 */
export function buildHtmlDocument(options: {
  body: string
  title: string
  siteTitle: string
  language: string
  description?: string
  islands?: IslandInstance[]
  styles?: string
  headExtra?: string
}): string {
  const { body, title, siteTitle, language, description, islands = [], styles, headExtra } = options
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle
  const descMeta = description
    ? `<meta name="description" content="${escapeHtml(description)}" />`
    : ''

  const styleTags = styles
    ? `<style>${styles}</style>`
    : ''

  const islandScripts = islands.length > 0
    ? generateIslandScripts(islands)
    : ''

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(fullTitle)}</title>
  ${descMeta}
  ${styleTags}
  ${headExtra ?? ''}
</head>
<body>
${body}
${islandScripts}
</body>
</html>`
}

/**
 * Safely serialize a value to JSON, dropping circular references.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet()
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return undefined
      seen.add(val)
    }
    return val
  }) ?? '{}'
}

/**
 * Generate island activation scripts
 */
function generateIslandScripts(islands: IslandInstance[]): string {
  if (islands.length === 0) return ''

  // Build a manifest of all islands, grouped by activation strategy
  const manifest = islands.map(island => ({
    id: island.id,
    name: island.name,
    activate: island.activate,
    props: island.props ?? {},
  }))

  return `<script type="module">
import { h, hydrate } from 'preact';
const manifest = ${safeStringify(manifest)};
for (const island of manifest) {
  const el = document.querySelector('[data-titan-island="' + island.id + '\"]');
  if (!el) continue;
  const loader = () => import('/assets/islands/' + island.name + '.js').then(m => {
    hydrate(h(m.default, island.props), el);
  });
  if (island.activate === 'client:load') {
    loader();
  } else if (island.activate === 'client:visible') {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { loader(); observer.disconnect(); }
    });
    observer.observe(el);
  } else if (island.activate === 'client:idle') {
    'requestIdleCallback' in window ? requestIdleCallback(loader) : setTimeout(loader, 200);
  }
}
</script>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
