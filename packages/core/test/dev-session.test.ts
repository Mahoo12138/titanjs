import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DevSession } from '../src/dev-session.js'
import type { TitanConfig } from '@titan/types'

describe('DevSession', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-devsession-test-'))

    const postsDir = path.join(tmpDir, 'source', '_posts')
    const pagesDir = path.join(tmpDir, 'source', '_pages')
    await fs.mkdir(postsDir, { recursive: true })
    await fs.mkdir(pagesDir, { recursive: true })

    await fs.writeFile(path.join(postsDir, '2024-01-15-hello.md'), `---
title: Hello World
date: 2024-01-15
tags:
  - test
  - unique
categories:
  - guides
---

# Hello World

This is a test post.
`)

    await fs.writeFile(path.join(postsDir, '2024-02-01-second.md'), `---
title: Second Post
date: 2024-02-01
tags:
  - test
  - second
categories:
  - guides
  - updates
---

# Second Post

Another test post.
`)

    await fs.writeFile(path.join(pagesDir, 'about.md'), `---
title: About
---

# About

About page content.
`)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeConfig(overrides: Partial<TitanConfig> = {}): TitanConfig {
    return {
      title: 'Test Site',
      url: 'https://test.com',
      language: 'en',
      source: 'source',
      build: {
        outDir: 'public',
        cacheDir: '.titan-cache',
        concurrency: 4,
      },
      markdown: {
        remarkPlugins: [],
        rehypePlugins: [],
      },
      styles: { tokens: {} },
      plugins: [],
      ...overrides,
    }
  }

  it('should init without full HTML emit', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })

    const result = await session.init()

    expect(result.entries).toBe(3)
    expect(result.routes).toBeGreaterThan(3)
    expect(result.elapsed).toBeGreaterThan(0)

    // Verify no HTML files were written to disk
    const outDir = path.join(tmpDir, 'public')
    const outExists = await fs.access(outDir).then(() => true).catch(() => false)
    expect(outExists).toBe(false)
  })

  it('should render pages on demand', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    // Render index
    const indexHtml = await session.renderOnDemand('/')
    expect(indexHtml).not.toBeNull()
    expect(indexHtml).toContain('Test Site')

    // Render a post
    const postHtml = await session.renderOnDemand('/posts/hello/')
    expect(postHtml).not.toBeNull()
    expect(postHtml).toContain('Hello World')
  })

  it('should cache rendered pages', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    const html1 = await session.renderOnDemand('/')
    const html2 = await session.renderOnDemand('/')

    // Should be the exact same reference (cached)
    expect(html1).toBe(html2)
  })

  it('should expose render cache stats', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    await session.renderOnDemand('/')
    await session.renderOnDemand('/')
    await session.renderOnDemand('/posts/hello/')

    expect(session.stats.renderCount).toBe(3)
    expect(session.stats.cacheHits).toBe(1)
    expect(session.stats.cacheMisses).toBe(2)
    expect(session.cacheHitRate).toBeCloseTo(1 / 3)
  })

  it('should return null for unknown routes', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    const html = await session.renderOnDemand('/nonexistent/')
    expect(html).toBeNull()
  })

  it('should resolve routes by URL', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    const route = session.getRouteForUrl('/')
    expect(route).toBeDefined()
    expect(route!.type).toBe('list')

    const postRoute = session.getRouteForUrl('/posts/hello/')
    expect(postRoute).toBeDefined()
    expect(postRoute!.type).toBe('item')
    expect(postRoute!.slug).toBe('hello')
  })

  it('should handle file changes and return affected routes', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    // Modify a post (body-only change)
    const filePath = path.join(tmpDir, 'source', '_posts', '2024-01-15-hello.md')
    await fs.writeFile(filePath, `---
title: Hello World
date: 2024-01-15
tags:
  - test
  - unique
categories:
  - guides
---

# Hello World Updated

This is the updated content.
`)

    const result = await session.handleFileChange(filePath)

    expect(result.entryId).toBe('hello')
    expect(result.affectedRoutes.length).toBeGreaterThan(0)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)

    // The post's own route should be affected
    expect(result.affectedRoutes).toContain('/posts/hello/')
    expect(result.frontmatterChanged).toBe(false)
    expect(result.affectedRoutes).not.toContain('/')
    expect(result.affectedRoutes).not.toContain('/tags/test/')
  })

  it('should cascade frontmatter changes to related routes', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    const filePath = path.join(tmpDir, 'source', '_posts', '2024-01-15-hello.md')
    await fs.writeFile(filePath, `---
title: Hello World
date: 2024-03-01
tags:
  - test
  - promoted
categories:
  - updates
---

# Hello World Updated

This change updates ordering and metadata.
`)

    const result = await session.handleFileChange(filePath)

    expect(result.frontmatterChanged).toBe(true)
    expect(result.affectedRoutes).toContain('/posts/hello/')
    expect(result.affectedRoutes).toContain('/posts/second/')
    expect(result.affectedRoutes).toContain('/')
    expect(result.affectedRoutes).toContain('/archives/')
    expect(result.affectedRoutes).toContain('/tags/test/')
    expect(result.affectedRoutes).toContain('/tags/unique/')
    expect(result.affectedRoutes).toContain('/tags/promoted/')
    expect(result.affectedRoutes).toContain('/tags/')
    expect(result.affectedRoutes).toContain('/categories/guides/')
    expect(result.affectedRoutes).toContain('/categories/updates/')
    expect(result.affectedRoutes).toContain('/categories/')
  })

  it('should do full reindex for unknown files', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    // Trigger change for a brand new file
    const newFile = path.join(tmpDir, 'source', '_posts', '2024-03-01-new.md')
    await fs.writeFile(newFile, `---
title: New Post
date: 2024-03-01
tags:
  - new
---

# New post
`)

    const result = await session.handleFileChange(newFile)

    // Full reindex: entryId is null, all routes affected
    expect(result.entryId).toBeNull()
    expect(result.affectedRoutes.length).toBeGreaterThan(0)
    expect(session.stats.fullReindexCount).toBe(1)
  })

  it('should invalidate render cache on file change', async () => {
    const session = new DevSession({
      rootDir: tmpDir,
      config: makeConfig(),
    })
    await session.init()

    // Render the post first
    const before = await session.renderOnDemand('/posts/hello/')
    expect(before).toContain('This is a test post.')

    // Modify the post
    const filePath = path.join(tmpDir, 'source', '_posts', '2024-01-15-hello.md')
    await fs.writeFile(filePath, `---
title: Hello World
date: 2024-01-15
tags:
  - test
  - unique
categories:
  - guides
---

# Hello World Updated

New content here.
`)

    await session.handleFileChange(filePath)

    // Re-render should produce updated content
    const after = await session.renderOnDemand('/posts/hello/')
    expect(after).toContain('New content here.')
    expect(after).not.toContain('This is a test post.')
  })
})
