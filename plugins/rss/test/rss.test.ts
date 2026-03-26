import { describe, it, expect } from 'vitest'
import { pluginRSS } from '../src/index.js'
import type { GenerateContext, EmitContext, Route } from '@titan/types'

function makeRoute(overrides: Partial<Route> & { path: string; type: Route['type'] }): Route {
  return {
    url: overrides.path,
    contentType: 'post',
    layout: 'post',
    outputPath: overrides.path === '/' ? 'index.html' : overrides.path.slice(1) + 'index.html',
    data: {},
    ...overrides,
  } as Route
}

function makeSiteData() {
  const posts = [
    {
      id: 'hello',
      slug: 'hello',
      title: 'Hello World',
      url: '/posts/hello/',
      date: new Date('2024-01-15'),
      excerpt: 'A hello post',
      html: '<p>Hello content</p>',
      tags: [{ name: 'js', slug: 'js', count: 1 }],
      categories: [],
      contentType: 'post',
    },
    {
      id: 'second',
      slug: 'second',
      title: 'Second Post',
      url: '/posts/second/',
      date: new Date('2024-02-20'),
      excerpt: 'Second excerpt',
      html: '<p>Second content</p>',
      tags: [],
      categories: [],
      contentType: 'post',
    },
  ]

  return {
    posts: {
      name: 'posts',
      entries: posts,
      find: () => posts,
      findOne: (slug: string) => posts.find(p => p.slug === slug),
      sort: () => posts,
      count: () => posts.length,
    },
    pages: { name: 'pages', entries: [], find: () => [], findOne: () => undefined, sort: () => [], count: () => 0 },
    tags: new Map(),
    categories: new Map(),
  }
}

describe('plugin-rss', () => {
  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginRSS({ title: 'Test', description: 'Test Feed' })
    expect(plugin.name).toBe('@titan/plugin-rss')
    expect(plugin.hooks!['generate:after']).toBeDefined()
    expect(plugin.hooks!['emit:before']).toBeDefined()
  })

  it('should add rss.xml route in generate:after', async () => {
    const plugin = pluginRSS({ title: 'Test', description: 'Test Feed', siteUrl: 'https://example.com' })
    const ctx: GenerateContext = {
      siteData: makeSiteData() as any,
      routes: [
        { path: '/', type: 'item', data: {} },
      ],
    }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const rssRoute = ctx.routes.find(r => r.path === '/rss.xml')
    expect(rssRoute).toBeDefined()
    expect(rssRoute!.type).toBe('custom')
    expect(rssRoute!.data.content).toContain('<?xml')
    expect(rssRoute!.data.content).toContain('<rss')
  })

  it('should generate Atom feed when atom option is true', async () => {
    const plugin = pluginRSS({
      title: 'Test',
      description: 'Test Feed',
      siteUrl: 'https://example.com',
      atom: true,
    })
    const ctx: GenerateContext = {
      siteData: makeSiteData() as any,
      routes: [],
    }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const atomRoute = ctx.routes.find(r => r.path === '/atom.xml')
    expect(atomRoute).toBeDefined()
    expect(atomRoute!.data.content).toContain('<feed')
    expect(atomRoute!.data.content).toContain('xmlns="http://www.w3.org/2005/Atom"')
  })

  it('should include post entries in RSS XML', async () => {
    const plugin = pluginRSS({ title: 'Blog', description: 'A blog', siteUrl: 'https://example.com' })
    const ctx: GenerateContext = {
      siteData: makeSiteData() as any,
      routes: [],
    }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/rss.xml')!.data.content as string
    expect(xml).toContain('Hello World')
    expect(xml).toContain('Second Post')
    expect(xml).toContain('<title>Blog</title>')
    expect(xml).toContain('<description>A blog</description>')
  })

  it('should respect the limit option', async () => {
    const plugin = pluginRSS({
      title: 'Blog',
      description: 'A blog',
      siteUrl: 'https://example.com',
      limit: 1,
    })
    const ctx: GenerateContext = {
      siteData: makeSiteData() as any,
      routes: [],
    }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/rss.xml')!.data.content as string
    // Most recent post should be included (Second Post, date 2024-02-20)
    expect(xml).toContain('Second Post')
    // Older post should be excluded
    expect(xml).not.toContain('Hello World')
  })

  it('should set ctx.html in emit:before for rss route', async () => {
    const plugin = pluginRSS({ title: 'Test', description: 'Test' })
    const ctx: EmitContext = {
      route: makeRoute({ path: '/rss.xml', type: 'custom', outputPath: 'rss.xml', data: { content: '<rss>test</rss>' } }),
      siteData: makeSiteData() as any,
      outputPath: '/out/rss.xml',
      html: '',
    }

    await plugin.hooks!['emit:before']!(ctx, async () => {})

    expect(ctx.html).toBe('<rss>test</rss>')
  })

  it('should not modify emit ctx for non-feed routes', async () => {
    const plugin = pluginRSS({ title: 'Test', description: 'Test' })
    const ctx: EmitContext = {
      route: makeRoute({ path: '/posts/hello/', type: 'item', data: {} }),
      siteData: makeSiteData() as any,
      outputPath: '/out/posts/hello/index.html',
      html: '<p>Hello</p>',
    }

    await plugin.hooks!['emit:before']!(ctx, async () => {})

    expect(ctx.html).toBe('<p>Hello</p>')
  })

  it('should include tags as categories in RSS items', async () => {
    const plugin = pluginRSS({ title: 'Blog', description: 'Blog', siteUrl: 'https://example.com' })
    const ctx: GenerateContext = {
      siteData: makeSiteData() as any,
      routes: [],
    }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/rss.xml')!.data.content as string
    expect(xml).toContain('<category>js</category>')
  })
})
