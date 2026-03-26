import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { h } from 'preact'
import { emitRoutesWithTheme } from '../src/theme-emitter.js'
import type { Route, SiteData, ResolvedTheme, LayoutModule, Post } from '@titan/types'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-emitter-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

function makePost(slug: string, title: string): Post {
  return {
    id: slug,
    slug,
    title,
    contentType: 'post',
    sourcePath: `/posts/${slug}.md`,
    raw: '',
    content: `# ${title}`,
    html: `<h1>${title}</h1><p>Content of ${title}</p>`,
    frontmatter: {},
    date: new Date('2025-01-01'),
    url: `/posts/${slug}/`,
    outputPath: `posts/${slug}/index.html`,
    assets: [],
    headings: [],
    wordCount: 100,
    readingTime: 1,
    tags: [],
    categories: [],
    excerpt: `Excerpt of ${title}`,
  } as Post
}

function makeSiteData(posts: Post[]): SiteData {
  return {
    posts: {
      entries: posts,
      findOne: (slug: string) => posts.find(p => p.slug === slug),
      count: posts.length,
    },
    pages: {
      entries: [],
      findOne: () => undefined,
      count: 0,
    },
    tags: new Map(),
    categories: new Map(),
  } as any
}

function makeTheme(): ResolvedTheme {
  const defaultLayout: LayoutModule = {
    default: (ctx: any) =>
      h('main', null,
        h('h1', null, ctx.site?.title ?? 'Site'),
        h('p', null, 'Default layout'),
      ),
  }

  const postLayout: LayoutModule = {
    default: (ctx: any) =>
      h('article', null,
        h('h1', null, ctx.post?.title ?? 'Post'),
        h('div', { dangerouslySetInnerHTML: { __html: ctx.post?.html ?? '' } }),
      ),
  }

  return {
    definition: { name: 'test-theme' },
    config: {},
    layouts: new Map([
      ['default', defaultLayout],
      ['post', postLayout],
    ]),
    slotComponents: new Map(),
    typeLayoutMap: { post: 'post', page: 'page' },
    rootDir: '/tmp/theme',
  }
}

describe('ThemeEmitter', () => {
  it('emits index page with default layout', async () => {
    const posts = [makePost('hello', 'Hello World')]
    const siteData = makeSiteData(posts)
    const theme = makeTheme()

    const routes: Route[] = [
      {
        path: '/',
        url: '/',
        contentType: 'index',
        layout: 'default',
        outputPath: 'index.html',
        type: 'list',
      },
    ]

    const results = await emitRoutesWithTheme(routes, siteData, {
      outDir: tmpDir,
      siteConfig: { title: 'My Site', url: 'https://example.com', language: 'en' },
      theme,
    })

    expect(results.length).toBe(1)
    expect(results[0].html).toContain('<!DOCTYPE html>')
    expect(results[0].html).toContain('My Site')

    // File should be written
    const content = await fs.readFile(path.join(tmpDir, 'index.html'), 'utf-8')
    expect(content).toContain('Default layout')
  })

  it('emits post page with post layout', async () => {
    const posts = [makePost('test-post', 'Test Post Title')]
    const siteData = makeSiteData(posts)
    const theme = makeTheme()

    const routes: Route[] = [
      {
        path: '/posts/:slug',
        url: '/posts/test-post/',
        contentType: 'post',
        slug: 'test-post',
        layout: 'post',
        outputPath: 'posts/test-post/index.html',
        type: 'item',
      },
    ]

    const results = await emitRoutesWithTheme(routes, siteData, {
      outDir: tmpDir,
      siteConfig: { title: 'Blog', url: 'https://blog.com', language: 'en' },
      theme,
    })

    expect(results.length).toBe(1)
    expect(results[0].html).toContain('Test Post Title')

    const content = await fs.readFile(
      path.join(tmpDir, 'posts/test-post/index.html'),
      'utf-8',
    )
    expect(content).toContain('<article>')
    expect(content).toContain('Test Post Title')
  })

  it('falls back to basic HTML when layout not found', async () => {
    const posts = [makePost('orphan', 'Orphan Post')]
    const siteData = makeSiteData(posts)
    const theme: ResolvedTheme = {
      ...makeTheme(),
      layouts: new Map(), // no layouts at all
    }

    const routes: Route[] = [
      {
        path: '/posts/:slug',
        url: '/posts/orphan/',
        contentType: 'post',
        slug: 'orphan',
        layout: 'missing',
        outputPath: 'posts/orphan/index.html',
        type: 'item',
      },
    ]

    const results = await emitRoutesWithTheme(routes, siteData, {
      outDir: tmpDir,
      siteConfig: { title: 'Site', url: 'https://site.com', language: 'en' },
      theme,
    })

    expect(results.length).toBe(1)
    expect(results[0].html).toContain('<!DOCTYPE html>')
    expect(results[0].html).toContain('titan-prose')
  })

  it('skips routes when entry is not found', async () => {
    const siteData = makeSiteData([])
    const theme = makeTheme()

    const routes: Route[] = [
      {
        path: '/posts/:slug',
        url: '/posts/missing/',
        contentType: 'post',
        slug: 'missing',
        layout: 'post',
        outputPath: 'posts/missing/index.html',
        type: 'item',
      },
    ]

    const results = await emitRoutesWithTheme(routes, siteData, {
      outDir: tmpDir,
      siteConfig: { title: 'Site', url: 'https://site.com', language: 'en' },
      theme,
    })

    expect(results.length).toBe(0)
  })

  it('creates nested directories for output files', async () => {
    const posts = [makePost('deep', 'Deep Post')]
    const siteData = makeSiteData(posts)
    const theme = makeTheme()

    const routes: Route[] = [
      {
        path: '/a/b/c',
        url: '/a/b/c/',
        contentType: 'post',
        slug: 'deep',
        layout: 'post',
        outputPath: 'a/b/c/index.html',
        type: 'item',
      },
    ]

    await emitRoutesWithTheme(routes, siteData, {
      outDir: tmpDir,
      siteConfig: { title: 'Site', url: 'https://site.com', language: 'en' },
      theme,
    })

    const stat = await fs.stat(path.join(tmpDir, 'a/b/c/index.html'))
    expect(stat.isFile()).toBe(true)
  })
})
