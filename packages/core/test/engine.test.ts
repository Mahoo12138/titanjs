import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Engine } from '../src/engine.js'
import type { TitanConfig } from '@titan/types'

describe('Engine (integration)', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-engine-test-'))

    // Create source structure
    const postsDir = path.join(tmpDir, 'source', '_posts')
    const pagesDir = path.join(tmpDir, 'source', '_pages')
    await fs.mkdir(postsDir, { recursive: true })
    await fs.mkdir(pagesDir, { recursive: true })

    await fs.writeFile(path.join(postsDir, '2024-01-15-hello.md'), `---
title: Hello World
date: 2024-01-15
tags:
  - test
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

  it('should build a complete site', async () => {
    const engine = new Engine({
      rootDir: tmpDir,
      config: makeConfig(),
      noCache: true,
    })

    const result = await engine.build()

    expect(result.entries).toBe(3)
    expect(result.routes).toBeGreaterThan(3)
    expect(result.elapsed).toBeGreaterThan(0)
  })

  it('should generate HTML files in outDir', async () => {
    const engine = new Engine({
      rootDir: tmpDir,
      config: makeConfig(),
      noCache: true,
    })

    await engine.build()

    const outDir = path.join(tmpDir, 'public')

    // Check that key files exist
    const indexHtml = await fs.readFile(path.join(outDir, 'index.html'), 'utf-8')
    expect(indexHtml).toContain('Test Site')

    const postHtml = await fs.readFile(path.join(outDir, 'posts', 'hello', 'index.html'), 'utf-8')
    expect(postHtml).toContain('Hello World')

    const pageHtml = await fs.readFile(path.join(outDir, 'about', 'index.html'), 'utf-8')
    expect(pageHtml).toContain('About')
  })

  it('should generate tag pages', async () => {
    const engine = new Engine({
      rootDir: tmpDir,
      config: makeConfig(),
      noCache: true,
    })

    await engine.build()

    const tagHtml = await fs.readFile(
      path.join(tmpDir, 'public', 'tags', 'test', 'index.html'),
      'utf-8',
    )
    expect(tagHtml).toContain('test')
  })

  it('should use cache on second build', async () => {
    const config = makeConfig()
    const engine1 = new Engine({ rootDir: tmpDir, config })
    const result1 = await engine1.build()

    const engine2 = new Engine({ rootDir: tmpDir, config })
    const result2 = await engine2.build()

    expect(result2.entries).toBe(result1.entries)
    // Cached build should generally be faster (not guaranteed in CI, so just check it works)
    expect(result2.routes).toBe(result1.routes)
  })

  it('should clean cache and output', async () => {
    const engine = new Engine({
      rootDir: tmpDir,
      config: makeConfig(),
    })

    await engine.build()
    await engine.clean()

    await expect(fs.stat(path.join(tmpDir, '.titan-cache'))).rejects.toThrow()
    await expect(fs.stat(path.join(tmpDir, 'public'))).rejects.toThrow()
  })

  it('should execute plugin hooks', async () => {
    const hookLog: string[] = []

    const config = makeConfig({
      plugins: [
        {
          name: 'test-plugin',
          hooks: {
            'transform:entry': async (ctx, next) => {
              hookLog.push(`transform:${ctx.entry.slug}`)
              await next()
            },
            'generate:after': async (_ctx, next) => {
              hookLog.push('generate:done')
              await next()
            },
          },
        },
      ],
    })

    const engine = new Engine({ rootDir: tmpDir, config, noCache: true })
    await engine.build()

    expect(hookLog).toContain('generate:done')
    expect(hookLog.filter(h => h.startsWith('transform:'))).toHaveLength(3)
  })
})
