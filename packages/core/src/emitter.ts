/**
 * Emitter - Render routes to HTML and write output files
 *
 * Responsibilities:
 * - Resolve layout for each route
 * - Render HTML using the template engine
 * - Write output files to the build directory
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Route, SiteData, EmitContext, BaseEntry, Post, Page } from '@titan/types'

export interface EmitterOptions {
  /** Absolute path to output directory */
  outDir: string
  /** Site configuration for template rendering */
  siteConfig: { title: string; url: string; language: string }
}

/**
 * Emit all routes as static HTML files
 */
export async function emitRoutes(
  routes: Route[],
  siteData: SiteData,
  options: EmitterOptions,
): Promise<EmitContext[]> {
  const contexts: EmitContext[] = []

  for (const route of routes) {
    const html = renderRoute(route, siteData, options.siteConfig)
    const outputPath = path.join(options.outDir, route.outputPath)

    // Ensure directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, html, 'utf-8')

    contexts.push({
      route,
      siteData,
      outputPath,
      html,
    })
  }

  return contexts
}

/**
 * Render a route to an HTML string (built-in minimal template)
 *
 * In Phase 3, this will be replaced by Preact SSR with theme layouts.
 * For Phase 1, we use a simple HTML template.
 */
function renderRoute(
  route: Route,
  siteData: SiteData,
  siteConfig: { title: string; url: string; language: string },
): string {
  const { type, contentType, slug } = route

  if (type === 'item' && contentType === 'post' && slug) {
    const post = siteData.posts.findOne(slug) as Post | undefined
    if (post) return renderPostPage(post, siteConfig)
  }

  if (type === 'item' && contentType === 'page' && slug) {
    const page = siteData.pages.findOne(slug) as Page | undefined
    if (page) return renderSimplePage(page, siteConfig)
  }

  if (type === 'list' && route.url === '/') {
    return renderIndexPage(siteData, siteConfig)
  }

  if (type === 'list' && contentType === 'tag') {
    return renderTagPage(route, siteData, siteConfig)
  }

  if (type === 'list' && contentType === 'category') {
    return renderCategoryPage(route, siteData, siteConfig)
  }

  // Fallback
  return renderFallback(route, siteConfig)
}

// ── Built-in minimal templates (Phase 1 only) ──

function htmlTemplate(title: string, body: string, config: { language: string }): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(config.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 70ch; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #111; }
    a { color: #2563eb; }
    .titan-prose img { max-width: 100%; }
    .titan-prose pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 4px; }
    .titan-prose code { font-size: 0.9em; }
    .titan-prose blockquote { border-left: 3px solid #2563eb; padding-left: 1rem; color: #666; }
    nav { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #eee; }
    .post-meta { color: #666; margin-bottom: 1rem; }
    .post-list { list-style: none; padding: 0; }
    .post-list li { margin-bottom: 1.5rem; }
    .post-list time { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}

function renderPostPage(post: Post, config: { title: string; url: string; language: string }): string {
  const nav = `<nav><a href="/">← ${escapeHtml(config.title)}</a></nav>`
  const meta = `<div class="post-meta"><time>${formatDate(post.date)}</time> · ${post.readingTime} min read</div>`
  const tags = post.tags.length > 0
    ? `<div class="post-tags">${post.tags.map(t => `<a href="/tags/${t.slug}/">#${escapeHtml(t.name)}</a>`).join(' ')}</div>`
    : ''
  const prevNext = [
    post.prev ? `<a href="${post.prev.url}">← ${escapeHtml(post.prev.title)}</a>` : '',
    post.next ? `<a href="${post.next.url}">${escapeHtml(post.next.title)} →</a>` : '',
  ].filter(Boolean).join(' | ')

  const body = `${nav}
<article>
  <h1>${escapeHtml(post.title)}</h1>
  ${meta}
  ${tags}
  <div class="titan-prose">${post.html}</div>
  ${prevNext ? `<nav style="margin-top:2rem">${prevNext}</nav>` : ''}
</article>`

  return htmlTemplate(`${post.title} | ${config.title}`, body, config)
}

function renderSimplePage(page: Page, config: { title: string; url: string; language: string }): string {
  const nav = `<nav><a href="/">← ${escapeHtml(config.title)}</a></nav>`
  const body = `${nav}
<article>
  <h1>${escapeHtml(page.title)}</h1>
  <div class="titan-prose">${page.html}</div>
</article>`

  return htmlTemplate(`${page.title} | ${config.title}`, body, config)
}

function renderIndexPage(siteData: SiteData, config: { title: string; url: string; language: string }): string {
  const posts = siteData.posts.entries
  const list = posts.map(p =>
    `<li><time>${formatDate(p.date)}</time><br><a href="${p.url}">${escapeHtml(p.title)}</a><p>${escapeHtml(p.excerpt)}</p></li>`
  ).join('\n')

  const body = `<h1>${escapeHtml(config.title)}</h1>
<ul class="post-list">${list}</ul>`

  return htmlTemplate(config.title, body, config)
}

function renderTagPage(route: Route, siteData: SiteData, config: { title: string; url: string; language: string }): string {
  const tag = route.data?.tag as { name: string; slug: string } | undefined
  if (!tag) return renderFallback(route, config)

  const posts = siteData.posts.entries.filter(p => p.tags.some(t => t.slug === tag.slug))
  const list = posts.map(p =>
    `<li><time>${formatDate(p.date)}</time> - <a href="${p.url}">${escapeHtml(p.title)}</a></li>`
  ).join('\n')

  const body = `<nav><a href="/">← ${escapeHtml(config.title)}</a></nav>
<h1>Tag: ${escapeHtml(tag.name)}</h1>
<ul class="post-list">${list}</ul>`

  return htmlTemplate(`${tag.name} | ${config.title}`, body, config)
}

function renderCategoryPage(route: Route, siteData: SiteData, config: { title: string; url: string; language: string }): string {
  const category = route.data?.category as { name: string; slug: string } | undefined
  if (!category) return renderFallback(route, config)

  const posts = siteData.posts.entries.filter(p => p.categories.some(c => c.slug === category.slug))
  const list = posts.map(p =>
    `<li><time>${formatDate(p.date)}</time> - <a href="${p.url}">${escapeHtml(p.title)}</a></li>`
  ).join('\n')

  const body = `<nav><a href="/">← ${escapeHtml(config.title)}</a></nav>
<h1>Category: ${escapeHtml(category.name)}</h1>
<ul class="post-list">${list}</ul>`

  return htmlTemplate(`${category.name} | ${config.title}`, body, config)
}

function renderFallback(route: Route, config: { title: string; url: string; language: string }): string {
  const body = `<nav><a href="/">← ${escapeHtml(config.title)}</a></nav>
<h1>${escapeHtml(route.url)}</h1>
<p>This page has no dedicated template.</p>`

  return htmlTemplate(route.url, body, config)
}

// ── Helpers ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
