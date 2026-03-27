/**
 * Comments plugin factory
 *
 * Registers a slot component into `post:after-content` that renders
 * the chosen comment provider's embed snippet. Declared as an Island
 * with `client:visible` activation — zero JS cost until users scroll
 * to the comment section.
 */
import { h } from 'preact'
import type { PluginDefinition, SlotComponentDefinition } from '@titan/types'

// ── Provider configs ──

export interface GiscusConfig {
  repo: string
  repoId: string
  category: string
  categoryId: string
  mapping?: 'pathname' | 'url' | 'title' | 'og:title'
  reactionsEnabled?: boolean
  emitMetadata?: boolean
  inputPosition?: 'top' | 'bottom'
  theme?: string
  lang?: string
  loading?: 'lazy' | 'eager'
}

export interface WalineConfig {
  serverURL: string
  path?: string
  lang?: string
  dark?: string | boolean
  meta?: string[]
  requiredMeta?: string[]
  pageSize?: number
}

export interface TwikooConfig {
  envId: string
  region?: string
  lang?: string
}

export type CommentsOptions =
  | { provider: 'giscus'; giscus: GiscusConfig; slot?: string }
  | { provider: 'waline'; waline: WalineConfig; slot?: string }
  | { provider: 'twikoo'; twikoo: TwikooConfig; slot?: string }

// ── SSR components (render placeholder + config data for client hydration) ──

function GiscusComment(props: { config: GiscusConfig; post?: any }) {
  const c = props.config
  return h('div', { class: 'titan-comments titan-comments--giscus' },
    h('script', {
      src: 'https://giscus.app/client.js',
      'data-repo': c.repo,
      'data-repo-id': c.repoId,
      'data-category': c.category,
      'data-category-id': c.categoryId,
      'data-mapping': c.mapping ?? 'pathname',
      'data-reactions-enabled': c.reactionsEnabled !== false ? '1' : '0',
      'data-emit-metadata': c.emitMetadata ? '1' : '0',
      'data-input-position': c.inputPosition ?? 'bottom',
      'data-theme': c.theme ?? 'preferred_color_scheme',
      'data-lang': c.lang ?? 'zh-CN',
      'data-loading': c.loading ?? 'lazy',
      crossOrigin: 'anonymous',
      async: true,
    }),
  )
}

function WalineComment(props: { config: WalineConfig; post?: any }) {
  const c = props.config
  return h('div', { class: 'titan-comments titan-comments--waline' },
    h('div', { id: 'waline', 'data-server-url': c.serverURL }),
    h('script', {
      type: 'module',
      dangerouslySetInnerHTML: {
        __html: [
          `import { init } from 'https://unpkg.com/@waline/client@v3/dist/waline.js';`,
          `import 'https://unpkg.com/@waline/client@v3/dist/waline.css';`,
          `init({`,
          `  el: '#waline',`,
          `  serverURL: ${JSON.stringify(c.serverURL)},`,
          c.lang ? `  lang: ${JSON.stringify(c.lang)},` : '',
          c.dark !== undefined ? `  dark: ${JSON.stringify(c.dark)},` : '',
          c.pageSize ? `  pageSize: ${c.pageSize},` : '',
          `});`,
        ].filter(Boolean).join('\n'),
      },
    }),
  )
}

function TwikooComment(props: { config: TwikooConfig; post?: any }) {
  const c = props.config
  return h('div', { class: 'titan-comments titan-comments--twikoo' },
    h('div', { id: 'twikoo' }),
    h('script', {
      type: 'module',
      dangerouslySetInnerHTML: {
        __html: [
          `import twikoo from 'https://cdn.jsdelivr.net/npm/twikoo@1/dist/twikoo.all.min.js';`,
          `twikoo.init({`,
          `  envId: ${JSON.stringify(c.envId)},`,
          `  el: '#twikoo',`,
          c.region ? `  region: ${JSON.stringify(c.region)},` : '',
          c.lang ? `  lang: ${JSON.stringify(c.lang)},` : '',
          `});`,
        ].filter(Boolean).join('\n'),
      },
    }),
  )
}

// ── Plugin factory ──

export function pluginComments(options: CommentsOptions): PluginDefinition {
  const targetSlot = options.slot ?? 'post:after-content'

  let component: (props: any) => any

  switch (options.provider) {
    case 'giscus': {
      const config = options.giscus
      component = (props: any) => h(GiscusComment, { config, post: props.post })
      break
    }
    case 'waline': {
      const config = options.waline
      component = (props: any) => h(WalineComment, { config, post: props.post })
      break
    }
    case 'twikoo': {
      const config = options.twikoo
      component = (props: any) => h(TwikooComment, { config, post: props.post })
      break
    }
  }

  const slotComponent: SlotComponentDefinition = {
    slot: targetSlot,
    component,
    island: {
      component: async () => ({}),
      activate: 'client:visible',
    },
    order: 900, // comments go near the end
  }

  return {
    name: '@titan/plugin-comments',
    slotComponents: [slotComponent],
  }
}
