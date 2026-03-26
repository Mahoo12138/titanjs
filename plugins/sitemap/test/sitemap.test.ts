import { describe, it, expect } from 'vitest'
import { pluginSitemap } from '../src/index.js'
import type { GenerateContext, EmitContext, Route } from '@titan/types'

describe('plugin-sitemap', () => {
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

  function makeRoutes(): Route[] {
    return [
      makeRoute({ path: '/', type: 'item', data: { title: 'Home' } }),
      makeRoute({ path: '/posts/hello/', type: 'item', data: { title: 'Hello', date: new Date('2024-01-15') } }),
      makeRoute({ path: '/posts/world/', type: 'item', data: { title: 'World', date: new Date('2024-02-20') } }),
      makeRoute({ path: '/tags/', type: 'list', data: { title: 'Tags' } }),
    ]
  }

  function makeSiteData() {
    return {
      posts: { name: 'posts', entries: [], find: () => [], findOne: () => undefined, sort: () => [], count: () => 0 },
      pages: { name: 'pages', entries: [], find: () => [], findOne: () => undefined, sort: () => [], count: () => 0 },
      tags: new Map(),
      categories: new Map(),
    }
  }

  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginSitemap()
    expect(plugin.name).toBe('@titan/plugin-sitemap')
    expect(plugin.hooks).toBeDefined()
    expect(plugin.hooks!['generate:after']).toBeDefined()
    expect(plugin.hooks!['emit:before']).toBeDefined()
  })

  it('should add a sitemap.xml route in generate:after', async () => {
    const plugin = pluginSitemap({ siteUrl: 'https://example.com' })
    const routes = makeRoutes()
    const ctx: GenerateContext = { siteData: makeSiteData() as any, routes }

    const hook = plugin.hooks!['generate:after']!
    await hook(ctx, async () => {})

    const sitemapRoute = ctx.routes.find(r => r.path === '/sitemap.xml')
    expect(sitemapRoute).toBeDefined()
    expect(sitemapRoute!.type).toBe('custom')
    expect(sitemapRoute!.data.content).toContain('<?xml')
    expect(sitemapRoute!.data.content).toContain('<urlset')
  })

  it('should include all routes in sitemap XML', async () => {
    const plugin = pluginSitemap({ siteUrl: 'https://example.com' })
    const routes = makeRoutes()
    const ctx: GenerateContext = { siteData: makeSiteData() as any, routes }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/sitemap.xml')!.data.content as string
    expect(xml).toContain('https://example.com/')
    expect(xml).toContain('https://example.com/posts/hello/')
    expect(xml).toContain('https://example.com/posts/world/')
    expect(xml).toContain('https://example.com/tags/')
  })

  it('should exclude routes matching exclude patterns', async () => {
    const plugin = pluginSitemap({
      siteUrl: 'https://example.com',
      exclude: ['/tags/**'],
    })
    const routes = makeRoutes()
    const ctx: GenerateContext = { siteData: makeSiteData() as any, routes }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/sitemap.xml')!.data.content as string
    expect(xml).not.toContain('https://example.com/tags/')
    expect(xml).toContain('https://example.com/posts/hello/')
  })

  it('should set changefreq and priority', async () => {
    const plugin = pluginSitemap({
      siteUrl: 'https://example.com',
      changefreq: 'daily',
      priority: 0.8,
    })
    const routes = makeRoutes()
    const ctx: GenerateContext = { siteData: makeSiteData() as any, routes }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/sitemap.xml')!.data.content as string
    expect(xml).toContain('<changefreq>daily</changefreq>')
  })

  it('should set ctx.html in emit:before for sitemap route', async () => {
    const plugin = pluginSitemap({ siteUrl: 'https://example.com' })
    const sitemapRoute: Route = makeRoute({
      path: '/sitemap.xml',
      type: 'custom',
      outputPath: 'sitemap.xml',
      data: { content: '<sitemap-content/>' },
    })
    const ctx: EmitContext = {
      route: sitemapRoute,
      siteData: makeSiteData() as any,
      outputPath: '/out/sitemap.xml',
      html: '',
    }

    await plugin.hooks!['emit:before']!(ctx, async () => {})

    expect(ctx.html).toBe('<sitemap-content/>')
  })

  it('should not modify emit ctx for non-sitemap routes', async () => {
    const plugin = pluginSitemap({ siteUrl: 'https://example.com' })
    const ctx: EmitContext = {
      route: makeRoute({ path: '/posts/hello/', type: 'item', data: {} }),
      siteData: makeSiteData() as any,
      outputPath: '/out/posts/hello/index.html',
      html: '<p>Hello</p>',
    }

    await plugin.hooks!['emit:before']!(ctx, async () => {})

    expect(ctx.html).toBe('<p>Hello</p>')
  })

  it('should handle lastmod from route data', async () => {
    const plugin = pluginSitemap({ siteUrl: 'https://example.com', lastmod: true })
    const routes: Route[] = [
      makeRoute({ path: '/posts/dated/', type: 'item', data: { title: 'Dated', post: { updated: new Date('2024-03-01') } } }),
    ]
    const ctx: GenerateContext = { siteData: makeSiteData() as any, routes }

    await plugin.hooks!['generate:after']!(ctx, async () => {})

    const xml = ctx.routes.find(r => r.path === '/sitemap.xml')!.data.content as string
    expect(xml).toContain('<lastmod>')
  })
})
