import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pluginSearch } from '../src/plugin.js'
import type { GenerateContext, EmitContext, Post, SiteData, Collection, Route } from '@titan/types'

// ── Helpers ──

function makePost(overrides: Partial<Post>): Post {
  return {
    id: 'test',
    slug: 'test',
    contentType: 'post',
    locale: '',
    alternates: [],
    frontmatter: {},
    content: '',
    html: '<p>Hello world</p>',
    path: '/posts/test/index.html',
    url: '/posts/test/',
    assets: [],
    title: 'Test Post',
    date: new Date('2026-01-01'),
    updated: new Date('2026-01-01'),
    tags: [{ name: 'TypeScript', slug: 'typescript', count: 1 }],
    categories: [],
    excerpt: 'Hello world test excerpt',
    headings: [],
    readingTime: 1,
    prev: null,
    next: null,
    ...overrides,
  }
}

function makeCollection(posts: Post[]): Collection<Post> {
  return {
    name: 'posts',
    entries: posts,
    find: () => posts,
    findOne: (slug) => posts.find((p) => p.slug === slug),
    sort: () => posts,
    count: () => posts.length,
  }
}

function makeSiteData(posts: Post[]): SiteData {
  return {
    posts: makeCollection(posts),
    pages: { name: 'pages', entries: [], find: () => [], findOne: () => undefined, sort: () => [], count: () => 0 } as any,
    tags: new Map(),
    categories: new Map(),
  }
}

// ── Tests ──

describe('pluginSearch', () => {
  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginSearch()
    expect(plugin.name).toBe('@titan/plugin-search')
  })

  it('should register generate:after and emit:after hooks', () => {
    const plugin = pluginSearch()
    expect(plugin.hooks!['generate:after']).toBeDefined()
    expect(plugin.hooks!['emit:after']).toBeDefined()
  })

  describe('generate:after', () => {
    it('should add search-index.json route', async () => {
      const plugin = pluginSearch()
      const posts = [
        makePost({ slug: 'a', title: 'First Post', url: '/posts/a/' }),
        makePost({ slug: 'b', title: 'Second Post', url: '/posts/b/', tags: [] }),
      ]
      const routes: Route[] = []
      const ctx: GenerateContext = {
        siteData: makeSiteData(posts),
        routes,
      }

      await plugin.hooks!['generate:after']!(ctx, async () => {})

      const indexRoute = routes.find((r) => r.url === '/search-index.json')
      expect(indexRoute).toBeDefined()
      expect(indexRoute!.outputPath).toBe('search-index.json')
      expect(indexRoute!.data?.__searchIndex).toBeDefined()
    })

    it('should build correct index entries', async () => {
      const plugin = pluginSearch()
      const posts = [
        makePost({
          slug: 'a',
          title: 'TypeScript Guide',
          url: '/posts/a/',
          excerpt: 'Learn TypeScript',
          tags: [{ name: 'TS', slug: 'ts', count: 1 }],
        }),
      ]
      const routes: Route[] = []
      const ctx: GenerateContext = {
        siteData: makeSiteData(posts),
        routes,
      }

      await plugin.hooks!['generate:after']!(ctx, async () => {})

      const indexRoute = routes.find((r) => r.url === '/search-index.json')!
      const index = JSON.parse(indexRoute.data!.__searchIndex as string)
      expect(index).toHaveLength(1)
      expect(index[0].title).toBe('TypeScript Guide')
      expect(index[0].url).toBe('/posts/a/')
      expect(index[0].excerpt).toBe('Learn TypeScript')
      expect(index[0].tags).toEqual(['TS'])
    })

    it('should include content when configured', async () => {
      const plugin = pluginSearch({ fields: ['title', 'content'] })
      const posts = [
        makePost({
          slug: 'a',
          title: 'Post',
          url: '/posts/a/',
          html: '<p>Some detailed content here</p>',
        }),
      ]
      const routes: Route[] = []
      const ctx: GenerateContext = {
        siteData: makeSiteData(posts),
        routes,
      }

      await plugin.hooks!['generate:after']!(ctx, async () => {})

      const indexRoute = routes.find((r) => r.url === '/search-index.json')!
      const index = JSON.parse(indexRoute.data!.__searchIndex as string)
      expect(index[0].content).toContain('Some detailed content here')
      // excerpt and tags not included when not in fields
      expect(index[0].excerpt).toBeUndefined()
      expect(index[0].tags).toBeUndefined()
    })

    it('should respect custom index path', async () => {
      const plugin = pluginSearch({ indexPath: '/api/search.json' })
      const routes: Route[] = []
      const ctx: GenerateContext = {
        siteData: makeSiteData([makePost({})]),
        routes,
      }

      await plugin.hooks!['generate:after']!(ctx, async () => {})

      const indexRoute = routes.find((r) => r.url === '/api/search.json')
      expect(indexRoute).toBeDefined()
      expect(indexRoute!.outputPath).toBe('api/search.json')
    })
  })

  describe('emit:after', () => {
    it('should inject search UI into HTML pages', async () => {
      const plugin = pluginSearch()
      const ctx: EmitContext = {
        route: { path: '/', url: '/', contentType: 'post', layout: 'index', outputPath: 'index.html', type: 'list' },
        siteData: makeSiteData([]),
        outputPath: '/tmp/index.html',
        html: '<!DOCTYPE html><html><head></head><body><h1>Test</h1></body></html>',
      }

      await plugin.hooks!['emit:after']!(ctx, async () => {})

      expect(ctx.html).toContain('titan-search-trigger')
      expect(ctx.html).toContain('titan-search-overlay')
      expect(ctx.html).toContain('search-index.json')
    })

    it('should not inject into non-HTML content', async () => {
      const plugin = pluginSearch()
      const ctx: EmitContext = {
        route: {
          path: '/search-index.json', url: '/search-index.json',
          contentType: 'json', layout: '', outputPath: 'search-index.json', type: 'list',
          data: { __searchIndex: '[]' },
        },
        siteData: makeSiteData([]),
        outputPath: '/tmp/search-index.json',
        html: '[]',
      }

      // For the search index route, it skips HTML injection
      await plugin.hooks!['emit:after']!(ctx, async () => {})
      expect(ctx.html).not.toContain('titan-search-trigger')
    })

    it('should use custom shortcut key', async () => {
      const plugin = pluginSearch({ shortcut: 'k' })
      const ctx: EmitContext = {
        route: { path: '/', url: '/', contentType: 'post', layout: 'index', outputPath: 'index.html', type: 'list' },
        siteData: makeSiteData([]),
        outputPath: '/tmp/index.html',
        html: '<body>Test</body>',
      }

      await plugin.hooks!['emit:after']!(ctx, async () => {})
      expect(ctx.html).toContain('"k"')
    })
  })
})
