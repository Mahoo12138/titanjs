/**
 * Generator - Aggregate data and produce routes
 *
 * Responsibilities:
 * - Aggregate tags, categories across all entries
 * - Compute prev/next links for posts
 * - Build the route list (item, list, paginated)
 * - Assemble SiteData
 */
import type {
  BaseEntry,
  Post,
  Page,
  Tag,
  Category,
  Route,
  SiteData,
  Collection,
  GenerateContext,
} from '@titan/types'

/**
 * Build SiteData from transformed entries
 */
export function buildSiteData(entries: BaseEntry[]): SiteData {
  const posts = entries.filter((e): e is Post => e.contentType === 'post')
  const pages = entries.filter((e): e is Page => e.contentType === 'page')

  // Sort posts by date descending
  posts.sort((a, b) => b.date.getTime() - a.date.getTime())

  // Compute prev/next
  for (let i = 0; i < posts.length; i++) {
    posts[i].prev = i > 0 ? posts[i - 1] : null
    posts[i].next = i < posts.length - 1 ? posts[i + 1] : null
  }

  // Aggregate tags
  const tags = new Map<string, Tag>()
  for (const post of posts) {
    for (const tag of post.tags) {
      const existing = tags.get(tag.slug)
      if (existing) {
        existing.count++
      } else {
        tags.set(tag.slug, { ...tag, count: 1 })
      }
    }
  }

  // Aggregate categories
  const categories = new Map<string, Category>()
  for (const post of posts) {
    for (const cat of post.categories) {
      const existing = categories.get(cat.slug)
      if (existing) {
        existing.count++
      } else {
        categories.set(cat.slug, { ...cat, count: 1 })
      }
    }
  }

  // Update tag/category counts in posts
  for (const post of posts) {
    post.tags = post.tags.map(t => tags.get(t.slug) ?? t)
    post.categories = post.categories.map(c => categories.get(c.slug) ?? c)
  }

  return {
    posts: createCollection('posts', posts),
    pages: createCollection('pages', pages),
    tags,
    categories,
  }
}

/**
 * Generate routes from SiteData
 */
export function generateRoutes(siteData: SiteData): Route[] {
  const routes: Route[] = []

  // Post item routes
  for (const post of siteData.posts.entries) {
    routes.push({
      path: '/posts/:slug',
      url: post.url,
      contentType: 'post',
      slug: post.slug,
      layout: 'post',
      outputPath: post.path,
      type: 'item',
    })
  }

  // Page item routes
  for (const page of siteData.pages.entries) {
    routes.push({
      path: '/:slug',
      url: page.url,
      contentType: 'page',
      slug: page.slug,
      layout: 'page',
      outputPath: page.path,
      type: 'item',
    })
  }

  // Post list route (index)
  routes.push({
    path: '/',
    url: '/',
    contentType: 'post',
    layout: 'index',
    outputPath: 'index.html',
    type: 'list',
  })

  // Tag routes
  for (const [slug, tag] of siteData.tags) {
    routes.push({
      path: '/tags/:slug',
      url: `/tags/${slug}/`,
      contentType: 'tag',
      slug,
      layout: 'tag',
      outputPath: `tags/${slug}/index.html`,
      type: 'list',
      data: { tag },
    })
  }

  // Category routes
  for (const [slug, cat] of siteData.categories) {
    routes.push({
      path: '/categories/:slug',
      url: `/categories/${slug}/`,
      contentType: 'category',
      slug,
      layout: 'category',
      outputPath: `categories/${slug}/index.html`,
      type: 'list',
      data: { category: cat },
    })
  }

  // Archive route
  routes.push({
    path: '/archives',
    url: '/archives/',
    contentType: 'post',
    layout: 'archive',
    outputPath: 'archives/index.html',
    type: 'list',
  })

  // Tags index route
  routes.push({
    path: '/tags',
    url: '/tags/',
    contentType: 'tag',
    layout: 'tags',
    outputPath: 'tags/index.html',
    type: 'list',
  })

  // Categories index route
  routes.push({
    path: '/categories',
    url: '/categories/',
    contentType: 'category',
    layout: 'categories',
    outputPath: 'categories/index.html',
    type: 'list',
  })

  return routes
}

/**
 * Build a GenerateContext
 */
export function buildGenerateContext(entries: BaseEntry[]): GenerateContext {
  const siteData = buildSiteData(entries)
  const routes = generateRoutes(siteData)
  return { siteData, routes }
}

/**
 * Create a Collection wrapper with query methods
 */
export function createCollection<T extends BaseEntry>(name: string, entries: T[]): Collection<T> {
  return {
    name,
    entries,
    find(filter) {
      if (!filter) return [...entries]
      return entries.filter(entry => {
        for (const [key, value] of Object.entries(filter)) {
          if ((entry as any)[key] !== value) return false
        }
        return true
      })
    },
    findOne(slug) {
      return entries.find(e => e.slug === slug)
    },
    sort(key, order = 'asc') {
      const sorted = [...entries]
      sorted.sort((a, b) => {
        const aVal = a[key]
        const bVal = b[key]
        if (aVal < bVal) return order === 'asc' ? -1 : 1
        if (aVal > bVal) return order === 'asc' ? 1 : -1
        return 0
      })
      return sorted
    },
    count() {
      return entries.length
    },
  }
}
