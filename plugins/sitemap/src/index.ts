/**
 * @titan/plugin-sitemap
 *
 * Generates sitemap.xml for search engine indexing.
 * Supports all content types (posts, pages, custom collections).
 *
 * Usage:
 *   import sitemap from '@titan/plugin-sitemap'
 *   export default defineConfig({
 *     plugins: [sitemap({ changefreq: 'weekly' })]
 *   })
 */
import type { PluginDefinition, GenerateContext, Route, SiteData } from '@titan/types'

export interface SitemapOptions {
  /** Site base URL, e.g. 'https://example.com' */
  siteUrl?: string
  /** Default change frequency */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  /** Default priority (0.0 - 1.0) */
  priority?: number
  /** Routes to exclude (glob patterns or exact paths) */
  exclude?: string[]
  /** Whether to include lastmod; or a fixed date string */
  lastmod?: boolean | string
}

export function pluginSitemap(options: SitemapOptions = {}): PluginDefinition {
  const {
    siteUrl = '',
    changefreq = 'weekly',
    priority = 0.5,
    exclude = [],
    lastmod = true,
  } = options

  return {
    name: '@titan/plugin-sitemap',

    hooks: {
      'generate:after': async (ctx: GenerateContext, next) => {
        const { siteData, routes } = ctx

        // We need the site URL from siteData — it's not directly available,
        // so we'll pass it via the route data from the engine.
        // For now, extract from existing routes or use a placeholder.
        const sitemapXml = generateSitemapXml(routes, siteData, {
          siteUrl,
          changefreq,
          priority,
          exclude,
          lastmod,
        })

        // Add sitemap route
        ctx.routes.push({
          path: '/sitemap.xml',
          url: '/sitemap.xml',
          contentType: 'custom',
          layout: 'none',
          outputPath: 'sitemap.xml',
          type: 'custom',
          data: { content: sitemapXml },
        })

        await next()
      },

      'emit:before': async (ctx, next) => {
        // If this is the sitemap route, set the HTML to the XML content
        if (ctx.route.outputPath === 'sitemap.xml' && ctx.route.data?.content) {
          ctx.html = ctx.route.data.content as string
        }
        await next()
      },
    },
  }
}

function generateSitemapXml(
  routes: Route[],
  _siteData: SiteData,
  options: {
    siteUrl: string
    changefreq: string
    priority: number
    exclude: string[]
    lastmod: boolean | string
  },
): string {
  const now = typeof options.lastmod === 'string'
    ? options.lastmod
    : new Date().toISOString().split('T')[0]

  const filteredRoutes = routes.filter(route => {
    if (route.type === 'custom') return false
    if (options.exclude.some(pattern => matchExclude(route.url, pattern))) return false
    return true
  })

  const baseUrl = options.siteUrl.replace(/\/$/, '')

  const urls = filteredRoutes.map(route => {
    const loc = baseUrl + (route.url.endsWith('/') ? route.url : route.url + '/')
    const routePriority = getRoutePriority(route, options.priority)
    const routeLastmod = options.lastmod !== false ? (getRouteLastmod(route) || now) : null

    const lastmodTag = routeLastmod ? `\n    <lastmod>${routeLastmod}</lastmod>` : ''

    return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmodTag}
    <changefreq>${options.changefreq}</changefreq>
    <priority>${routePriority.toFixed(1)}</priority>
  </url>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`
}

function getRoutePriority(route: Route, defaultPriority: number): number {
  // Index page gets highest priority
  if (route.url === '/' || route.url === '') return 1.0
  // Item pages get default priority
  if (route.type === 'item') return defaultPriority
  // List pages get slightly lower priority
  return Math.max(0.1, defaultPriority - 0.2)
}

function getRouteLastmod(route: Route): string | null {
  // Try to extract date from route data
  const data = route.data as any
  if (data?.post?.updated) return formatDate(data.post.updated)
  if (data?.post?.date) return formatDate(data.post.date)
  return null
}

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().split('T')[0]
}

function matchExclude(url: string, pattern: string): boolean {
  // Simple glob matching: * matches anything
  if (pattern === url) return true
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
    return regex.test(url)
  }
  return false
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default pluginSitemap
