import { describe, it, expect } from 'vitest'
import { h } from 'preact'
import { renderLayout, Slot, buildHtmlDocument } from '../src/renderer.js'
import type { ResolvedTheme, LayoutModule, PageContext, SiteContext } from '@titan/types'

function makeSiteContext(): SiteContext {
  return {
    title: 'Test Site',
    url: 'https://example.com',
    language: 'en',
    data: {
      posts: { entries: [], findOne: () => undefined, count: 0 },
      pages: { entries: [], findOne: () => undefined, count: 0 },
      tags: new Map(),
      categories: new Map(),
    } as any,
  }
}

function makeTheme(overrides: Partial<ResolvedTheme> = {}): ResolvedTheme {
  return {
    definition: { name: 'test-theme' },
    config: {},
    layouts: new Map(),
    slotComponents: new Map(),
    typeLayoutMap: {},
    rootDir: '/tmp/theme',
    ...overrides,
  }
}

function makePageContext(overrides: Partial<PageContext> = {}): PageContext {
  return {
    site: makeSiteContext(),
    theme: {},
    route: {
      path: '/',
      url: '/',
      contentType: 'page',
      layout: 'default',
      outputPath: 'index.html',
      type: 'list',
    },
    ...overrides,
  }
}

describe('Renderer', () => {
  describe('renderLayout', () => {
    it('renders a simple layout to HTML', () => {
      const layout: LayoutModule = {
        default: (ctx: PageContext) =>
          h('div', { class: 'page' }, h('h1', null, ctx.site.title)),
      }
      const theme = makeTheme()
      const ctx = makePageContext()

      const result = renderLayout(layout, ctx, theme)
      expect(result.html).toContain('<div class="page">')
      expect(result.html).toContain('<h1>Test Site</h1>')
      expect(result.islands).toEqual([])
    })

    it('renders layout with nested elements', () => {
      const layout: LayoutModule = {
        default: () =>
          h('main', null,
            h('header', null, h('nav', null, 'Navigation')),
            h('article', null, 'Content'),
            h('footer', null, 'Footer'),
          ),
      }
      const theme = makeTheme()
      const ctx = makePageContext()

      const result = renderLayout(layout, ctx, theme)
      expect(result.html).toContain('<main>')
      expect(result.html).toContain('<header>')
      expect(result.html).toContain('<article>Content</article>')
      expect(result.html).toContain('<footer>Footer</footer>')
    })

    it('collects islands from slot components', () => {
      const SlotComp = () => h('div', null, 'Interactive')
      const theme = makeTheme({
        slotComponents: new Map([
          ['sidebar', [{
            slot: 'sidebar',
            component: SlotComp,
            island: {
              component: async () => ({ default: SlotComp }),
              activate: 'client:load',
            },
          }]],
        ]),
      })

      const layout: LayoutModule = {
        default: () => h('div', null, h(Slot as any, { name: 'sidebar' })),
      }
      const ctx = makePageContext()

      const result = renderLayout(layout, ctx, theme)
      expect(result.islands.length).toBe(1)
      expect(result.islands[0].activate).toBe('client:load')
      expect(result.html).toContain('data-titan-island')
    })
  })

  describe('Slot component', () => {
    it('renders slot components in order', () => {
      const First = () => h('span', null, 'First')
      const Second = () => h('span', null, 'Second')

      const theme = makeTheme({
        slotComponents: new Map([
          ['content', [
            { slot: 'content', component: First, order: 1 },
            { slot: 'content', component: Second, order: 2 },
          ]],
        ]),
      })

      const layout: LayoutModule = {
        default: () => h('div', null, h(Slot as any, { name: 'content' })),
      }
      const ctx = makePageContext()

      const result = renderLayout(layout, ctx, theme)
      expect(result.html).toContain('<span>First</span>')
      expect(result.html).toContain('<span>Second</span>')
      // data-slot attribute
      expect(result.html).toContain('data-slot="content"')
    })

    it('returns nothing for empty slots', () => {
      const theme = makeTheme()
      const layout: LayoutModule = {
        default: () =>
          h('div', null,
            'Before',
            h(Slot as any, { name: 'empty-slot' }),
            'After',
          ),
      }
      const ctx = makePageContext()

      const result = renderLayout(layout, ctx, theme)
      expect(result.html).toContain('Before')
      expect(result.html).toContain('After')
      expect(result.html).not.toContain('data-slot')
    })
  })

  describe('buildHtmlDocument', () => {
    it('builds a complete HTML document', () => {
      const html = buildHtmlDocument({
        body: '<main>Hello</main>',
        title: 'Page Title',
        siteTitle: 'My Site',
        language: 'en',
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html lang="en">')
      expect(html).toContain('<title>Page Title | My Site</title>')
      expect(html).toContain('<main>Hello</main>')
    })

    it('uses site title alone when no page title', () => {
      const html = buildHtmlDocument({
        body: '<p>Home</p>',
        title: '',
        siteTitle: 'My Site',
        language: 'zh-CN',
      })

      expect(html).toContain('<title>My Site</title>')
      expect(html).toContain('<html lang="zh-CN">')
    })

    it('includes description meta tag', () => {
      const html = buildHtmlDocument({
        body: '<p>Content</p>',
        title: 'Post',
        siteTitle: 'Site',
        language: 'en',
        description: 'A test post about things',
      })

      expect(html).toContain('<meta name="description" content="A test post about things"')
    })

    it('generates island activation scripts', () => {
      const html = buildHtmlDocument({
        body: '<div>Content</div>',
        title: 'Test',
        siteTitle: 'Site',
        language: 'en',
        islands: [
          {
            id: 'island-0',
            name: 'counter',
            activate: 'client:load',
            props: { count: 0 },
          },
        ],
      })

      expect(html).toContain('data-titan-island="island-0"')
      expect(html).toContain('/assets/islands/counter.js')
      expect(html).toContain('<script type="module">')
    })

    it('generates IntersectionObserver for client:visible islands', () => {
      const html = buildHtmlDocument({
        body: '<div>Content</div>',
        title: 'Test',
        siteTitle: 'Site',
        language: 'en',
        islands: [
          {
            id: 'island-1',
            name: 'gallery',
            activate: 'client:visible',
          },
        ],
      })

      expect(html).toContain('IntersectionObserver')
      expect(html).toContain('data-titan-island="island-1"')
    })

    it('generates requestIdleCallback for client:idle islands', () => {
      const html = buildHtmlDocument({
        body: '<div>Content</div>',
        title: 'Test',
        siteTitle: 'Site',
        language: 'en',
        islands: [
          {
            id: 'island-2',
            name: 'comments',
            activate: 'client:idle',
          },
        ],
      })

      expect(html).toContain('requestIdleCallback')
    })
  })
})
