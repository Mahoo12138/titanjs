/**
 * @titan/plugin-rss
 *
 * Generates RSS 2.0 and optional Atom feed.
 *
 * Usage:
 *   import rss from '@titan/plugin-rss'
 *   export default defineConfig({
 *     plugins: [rss({ limit: 20 })]
 *   })
 */
import type { PluginDefinition, GenerateContext, SiteData, Post } from '@titan/types'

export interface RSSOptions {
  /** Site base URL, e.g. 'https://example.com' */
  siteUrl?: string
  /** Feed title (defaults to site title) */
  title?: string
  /** Feed description */
  description?: string
  /** Maximum number of items in the feed */
  limit?: number
  /** Output path for RSS feed */
  output?: string
  /** Also generate Atom feed */
  atom?: boolean
  /** Atom feed output path */
  atomOutput?: string
  /** Content types to include (default: ['post']) */
  contentTypes?: string[]
  /** Custom feed language */
  language?: string
}

export function pluginRSS(options: RSSOptions = {}): PluginDefinition {
  const {
    limit = 20,
    output = 'rss.xml',
    atom = true,
    atomOutput = 'atom.xml',
    contentTypes = ['post'],
  } = options

  return {
    name: '@titan/plugin-rss',

    hooks: {
      'generate:after': async (ctx: GenerateContext, next) => {
        const { siteData } = ctx

        // Collect entries for the feed
        const posts = collectFeedEntries(siteData, contentTypes, limit)

        // Generate RSS 2.0
        const rssXml = generateRSS2(posts, siteData, options)
        ctx.routes.push({
          path: `/${output}`,
          url: `/${output}`,
          contentType: 'custom',
          layout: 'none',
          outputPath: output,
          type: 'custom',
          data: { content: rssXml },
        })

        // Generate Atom feed
        if (atom) {
          const atomXml = generateAtom(posts, siteData, options)
          ctx.routes.push({
            path: `/${atomOutput}`,
            url: `/${atomOutput}`,
            contentType: 'custom',
            layout: 'none',
            outputPath: atomOutput,
            type: 'custom',
            data: { content: atomXml },
          })
        }

        await next()
      },

      'emit:before': async (ctx, next) => {
        const out = ctx.route.outputPath
        if ((out === output || out === atomOutput) && ctx.route.data?.content) {
          ctx.html = ctx.route.data.content as string
        }
        await next()
      },
    },
  }
}

interface FeedEntry {
  title: string
  url: string
  date: Date
  content: string
  excerpt?: string
  tags?: string[]
}

function collectFeedEntries(
  siteData: SiteData,
  contentTypes: string[],
  limit: number,
): FeedEntry[] {
  const entries: FeedEntry[] = []

  if (contentTypes.includes('post')) {
    for (const post of siteData.posts.entries) {
      entries.push({
        title: (post as Post).title,
        url: post.url,
        date: (post as Post).date,
        content: post.html,
        excerpt: (post as Post).excerpt,
        tags: (post as Post).tags?.map(t => t.name),
      })
    }
  }

  // Sort by date descending and limit
  entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  return entries.slice(0, limit)
}

function generateRSS2(
  entries: FeedEntry[],
  _siteData: SiteData,
  options: RSSOptions,
): string {
  const title = escapeXml(options.title || 'Site Feed')
  const description = escapeXml(options.description || '')
  const language = options.language || 'en'
  const buildDate = new Date().toUTCString()

  const items = entries.map(entry => {
    const pubDate = entry.date.toUTCString()
    const categories = (entry.tags || [])
      .map(tag => `      <category>${escapeXml(tag)}</category>`)
      .join('\n')

    return `    <item>
      <title>${escapeXml(entry.title)}</title>
      <link>${escapeXml(entry.url)}</link>
      <guid isPermaLink="true">${escapeXml(entry.url)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(entry.excerpt || '')}</description>
${categories}
    </item>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <description>${description}</description>
    <language>${language}</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <generator>TitanJS</generator>
${items.join('\n')}
  </channel>
</rss>`
}

function generateAtom(
  entries: FeedEntry[],
  _siteData: SiteData,
  options: RSSOptions,
): string {
  const title = escapeXml(options.title || 'Site Feed')
  const updated = entries.length > 0
    ? entries[0].date.toISOString()
    : new Date().toISOString()

  const atomEntries = entries.map(entry => {
    const categories = (entry.tags || [])
      .map(tag => `      <category term="${escapeXml(tag)}" />`)
      .join('\n')

    return `  <entry>
    <title>${escapeXml(entry.title)}</title>
    <link href="${escapeXml(entry.url)}" />
    <id>${escapeXml(entry.url)}</id>
    <updated>${entry.date.toISOString()}</updated>
    <summary>${escapeXml(entry.excerpt || '')}</summary>
${categories}
  </entry>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${title}</title>
  <updated>${updated}</updated>
  <generator>TitanJS</generator>
${atomEntries.join('\n')}
</feed>`
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default pluginRSS
