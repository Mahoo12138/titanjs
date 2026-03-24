import { describe, it, expect } from 'vitest'
import { buildSiteData, generateRoutes } from '../src/generator.js'
import type { BaseEntry, Post, Page } from '@titan/types'

function makePost(slug: string, overrides: Partial<Post> = {}): Post {
  return {
    id: slug,
    slug,
    contentType: 'post',
    locale: '',
    alternates: [],
    frontmatter: {},
    content: '',
    html: '<p>content</p>',
    path: `/posts/${slug}/index.html`,
    url: `/posts/${slug}/`,
    assets: [],
    title: slug.charAt(0).toUpperCase() + slug.slice(1),
    date: new Date('2024-01-15'),
    updated: new Date('2024-01-15'),
    tags: [],
    categories: [],
    excerpt: 'excerpt',
    headings: [],
    readingTime: 1,
    prev: null,
    next: null,
    ...overrides,
  }
}

function makePage(slug: string): Page {
  return {
    id: slug,
    slug,
    contentType: 'page',
    locale: '',
    alternates: [],
    frontmatter: {},
    content: '',
    html: '<p>page</p>',
    path: `/${slug}/index.html`,
    url: `/${slug}/`,
    assets: [],
    title: slug.charAt(0).toUpperCase() + slug.slice(1),
  }
}

describe('Generator', () => {
  describe('buildSiteData', () => {
    it('should separate posts and pages', () => {
      const entries: BaseEntry[] = [
        makePost('hello'),
        makePage('about'),
        makePost('world'),
      ]

      const siteData = buildSiteData(entries)

      expect(siteData.posts.count()).toBe(2)
      expect(siteData.pages.count()).toBe(1)
    })

    it('should sort posts by date descending', () => {
      const entries: BaseEntry[] = [
        makePost('old', { date: new Date('2024-01-01') }),
        makePost('new', { date: new Date('2024-06-01') }),
        makePost('mid', { date: new Date('2024-03-01') }),
      ]

      const siteData = buildSiteData(entries)
      const slugs = siteData.posts.entries.map(p => p.slug)

      expect(slugs).toEqual(['new', 'mid', 'old'])
    })

    it('should compute prev/next links', () => {
      const entries: BaseEntry[] = [
        makePost('a', { date: new Date('2024-01-01') }),
        makePost('b', { date: new Date('2024-02-01') }),
        makePost('c', { date: new Date('2024-03-01') }),
      ]

      const siteData = buildSiteData(entries)
      const posts = siteData.posts.entries

      // Sorted desc: c, b, a
      expect(posts[0].prev).toBeNull()
      expect(posts[0].next?.slug).toBe('b')
      expect(posts[1].prev?.slug).toBe('c')
      expect(posts[1].next?.slug).toBe('a')
      expect(posts[2].prev?.slug).toBe('b')
      expect(posts[2].next).toBeNull()
    })

    it('should aggregate tags with counts', () => {
      const entries: BaseEntry[] = [
        makePost('a', { tags: [{ name: 'ts', slug: 'ts', count: 0 }] }),
        makePost('b', { tags: [{ name: 'ts', slug: 'ts', count: 0 }, { name: 'js', slug: 'js', count: 0 }] }),
      ]

      const siteData = buildSiteData(entries)

      expect(siteData.tags.get('ts')?.count).toBe(2)
      expect(siteData.tags.get('js')?.count).toBe(1)
    })

    it('should aggregate categories with counts', () => {
      const entries: BaseEntry[] = [
        makePost('a', { categories: [{ name: 'Tech', slug: 'tech', count: 0, children: [] }] }),
        makePost('b', { categories: [{ name: 'Tech', slug: 'tech', count: 0, children: [] }] }),
      ]

      const siteData = buildSiteData(entries)

      expect(siteData.categories.get('tech')?.count).toBe(2)
    })
  })

  describe('generateRoutes', () => {
    it('should generate correct routes', () => {
      const entries: BaseEntry[] = [
        makePost('hello', { tags: [{ name: 'ts', slug: 'ts', count: 0 }] }),
        makePage('about'),
      ]

      const siteData = buildSiteData(entries)
      const routes = generateRoutes(siteData)

      const types = routes.map(r => `${r.type}:${r.contentType}`)

      expect(types).toContain('item:post')
      expect(types).toContain('item:page')
      expect(types).toContain('list:post') // index
      expect(types).toContain('list:tag')
    })

    it('should generate index route', () => {
      const entries: BaseEntry[] = [makePost('hello')]
      const siteData = buildSiteData(entries)
      const routes = generateRoutes(siteData)

      const indexRoute = routes.find(r => r.url === '/')
      expect(indexRoute).toBeDefined()
      expect(indexRoute?.type).toBe('list')
    })
  })

  describe('Collection query methods', () => {
    it('findOne should find by slug', () => {
      const entries: BaseEntry[] = [makePost('hello'), makePost('world')]
      const siteData = buildSiteData(entries)

      expect(siteData.posts.findOne('hello')?.slug).toBe('hello')
      expect(siteData.posts.findOne('nonexistent')).toBeUndefined()
    })

    it('sort should return sorted copy', () => {
      const entries: BaseEntry[] = [
        makePost('a', { title: 'Zebra' }),
        makePost('b', { title: 'Apple' }),
      ]
      const siteData = buildSiteData(entries)

      const sorted = siteData.posts.sort('title', 'asc')
      expect(sorted[0].title).toBe('Apple')
      expect(sorted[1].title).toBe('Zebra')
    })
  })
})
