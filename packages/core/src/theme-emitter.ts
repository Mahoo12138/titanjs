/**
 * Theme Emitter - Render routes using Preact SSR theme layouts
 *
 * When a theme is loaded, this replaces the built-in HTML templates
 * with Preact SSR rendering through the theme's layout components.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  Route,
  SiteData,
  EmitContext,
  Post,
  Page,
  ResolvedTheme,
  PageContext,
  PostContext,
  PageLayoutContext,
  ListContext,
  SiteContext,
} from '@titan/types'
import { renderLayout, buildHtmlDocument, Slot } from './renderer.js'
import { resolveLayout } from './theme-loader.js'

export interface ThemeEmitterOptions {
  outDir: string
  siteConfig: { title: string; url: string; language: string }
  theme: ResolvedTheme
}

/**
 * Emit all routes using the theme's Preact layouts
 */
export async function emitRoutesWithTheme(
  routes: Route[],
  siteData: SiteData,
  options: ThemeEmitterOptions,
): Promise<EmitContext[]> {
  const { outDir, siteConfig, theme } = options
  const contexts: EmitContext[] = []

  const siteContext: SiteContext = {
    title: siteConfig.title,
    url: siteConfig.url,
    language: siteConfig.language,
    data: siteData,
  }

  for (const route of routes) {
    const ctx = buildPageContext(route, siteData, siteContext, theme)
    if (!ctx) continue

    // Find layout
    const layoutName = route.layout || 'default'
    const layout = theme.layouts.get(layoutName) ?? theme.layouts.get('default')

    let html: string

    if (layout) {
      // Render with Preact SSR
      const result = renderLayout(layout, ctx, theme)
      html = buildHtmlDocument({
        body: result.html,
        title: extractTitle(route, siteData),
        siteTitle: siteConfig.title,
        language: siteConfig.language,
        description: extractDescription(route, siteData),
        islands: result.islands,
        styles: theme.styles,
      })
    } else {
      // Fallback: basic HTML when no layout found
      html = buildHtmlDocument({
        body: `<div class="titan-prose">${extractContent(route, siteData)}</div>`,
        title: extractTitle(route, siteData),
        siteTitle: siteConfig.title,
        language: siteConfig.language,
        styles: theme.styles,
      })
    }

    // Write output
    const outputPath = path.join(outDir, route.outputPath)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, html, 'utf-8')

    contexts.push({ route, siteData, outputPath, html })
  }

  return contexts
}

/**
 * Build the appropriate PageContext for a route
 */
function buildPageContext(
  route: Route,
  siteData: SiteData,
  siteContext: SiteContext,
  theme: ResolvedTheme,
): PageContext | null {
  // Inject widgetRegistry into theme config so layouts can access it
  const themeConfigWithWidgets = {
    ...theme.config,
    __widgetRegistry: (theme as any).widgetRegistry ?? null,
  }

  const base: PageContext = {
    site: siteContext,
    theme: themeConfigWithWidgets,
    route,
    pagination: route.pagination,
  }

  const { type, contentType, slug } = route

  // Post item
  if (type === 'item' && contentType === 'post' && slug) {
    const post = siteData.posts.findOne(slug) as Post | undefined
    if (!post) return null
    return { ...base, post } as PostContext
  }

  // Page item
  if (type === 'item' && contentType === 'page' && slug) {
    const page = siteData.pages.findOne(slug) as Page | undefined
    if (!page) return null
    return { ...base, page } as PageLayoutContext
  }

  // Index list
  if (type === 'list' && route.url === '/') {
    return { ...base, posts: siteData.posts.entries } as ListContext
  }

  // Archive list (all posts for archive page)
  if (type === 'list' && route.layout === 'archive') {
    return { ...base, posts: siteData.posts.entries } as ListContext
  }

  // Tags index (all tags)
  if (type === 'list' && route.layout === 'tags') {
    return { ...base, posts: [], tags: [...siteData.tags.values()] } as any
  }

  // Categories index (all categories)
  if (type === 'list' && route.layout === 'categories') {
    return { ...base, posts: [], categories: [...siteData.categories.values()] } as any
  }

  // Tag list
  if (type === 'list' && contentType === 'tag') {
    const tag = route.data?.tag as any
    if (!tag) return null
    const posts = siteData.posts.entries.filter(
      (p) => p.tags.some((t) => t.slug === tag.slug),
    )
    return { ...base, posts, tag } as ListContext
  }

  // Category list
  if (type === 'list' && contentType === 'category') {
    const category = route.data?.category as any
    if (!category) return null
    const posts = siteData.posts.entries.filter(
      (p) => p.categories.some((c) => c.slug === category.slug),
    )
    return { ...base, posts, category } as ListContext
  }

  // Custom collection item
  if (type === 'item' && slug) {
    const entry = findEntryInSiteData(siteData, contentType, slug)
    if (!entry) return null
    return {
      ...base,
      entry,
      collection: contentType,
      // Forward route data (e.g., wikiTree, notebooksTree)
      ...route.data,
    } as any
  }

  // Custom collection list / generic list
  // Forward any route.data (wikiTree, filterTag, notebooksTree, etc.)
  return { ...base, posts: [], ...route.data } as any
}

function findEntryInSiteData(
  siteData: SiteData,
  contentType: string,
  slug: string,
): any | null {
  // Check if there's a collection for this content type
  const collection = (siteData as any)[contentType]
  if (collection && typeof collection === 'object' && 'findOne' in collection) {
    return collection.findOne(slug)
  }
  return null
}

function extractTitle(route: Route, siteData: SiteData): string {
  const { type, contentType, slug } = route
  if (type === 'item' && slug) {
    if (contentType === 'post') {
      const post = siteData.posts.findOne(slug)
      return (post as any)?.title ?? slug
    }
    if (contentType === 'page') {
      const page = siteData.pages.findOne(slug)
      return (page as any)?.title ?? slug
    }
  }
  if (type === 'list' && contentType === 'tag') {
    if (route.data?.tag) return `Tag: ${(route.data.tag as any)?.name ?? ''}`
    return 'Tags'
  }
  if (type === 'list' && contentType === 'category') {
    if (route.data?.category) return `Category: ${(route.data.category as any)?.name ?? ''}`
    return 'Categories'
  }
  if (route.layout === 'archive') {
    return 'Archives'
  }
  if (route.layout === 'wiki-index') {
    return route.data?.filterTag ? `Wiki: ${route.data.filterTag}` : 'Wiki'
  }
  if (route.layout === 'wiki') {
    return ''  // title extracted from entry below
  }
  if (route.layout === 'notebooks' || route.layout === 'notes') {
    return route.data?.notebook ? String(route.data.notebook) : 'Notebooks'
  }
  return ''
}

function extractDescription(route: Route, siteData: SiteData): string | undefined {
  const { type, contentType, slug } = route
  if (type === 'item' && contentType === 'post' && slug) {
    const post = siteData.posts.findOne(slug)
    return (post as any)?.excerpt
  }
  return undefined
}

function extractContent(route: Route, siteData: SiteData): string {
  const { type, contentType, slug } = route
  if (type === 'item' && slug) {
    if (contentType === 'post') return siteData.posts.findOne(slug)?.html ?? ''
    if (contentType === 'page') return siteData.pages.findOne(slug)?.html ?? ''
  }
  return ''
}
