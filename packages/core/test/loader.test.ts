import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadSourceFiles, loadFile } from '../src/loader.js'

describe('Loader', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should load a single Markdown file with frontmatter', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    await fs.writeFile(filePath, `---
title: Test Post
date: 2024-01-15
tags:
  - hello
---

# Hello World

Content here.
`)

    const ctx = await loadFile(filePath, 'post')

    expect(ctx.filePath).toBe(filePath)
    expect(ctx.contentType).toBe('post')
    expect(ctx.frontmatter.title).toBe('Test Post')
    expect(ctx.frontmatter.date).toEqual(new Date('2024-01-15'))
    expect(ctx.frontmatter.tags).toEqual(['hello'])
    expect(ctx.body).toContain('# Hello World')
    expect(ctx.body).toContain('Content here.')
  })

  it('should scan source directory for Markdown files', async () => {
    // Create source structure
    const postsDir = path.join(tmpDir, '_posts')
    const pagesDir = path.join(tmpDir, '_pages')
    await fs.mkdir(postsDir, { recursive: true })
    await fs.mkdir(pagesDir, { recursive: true })

    await fs.writeFile(path.join(postsDir, 'post1.md'), '---\ntitle: Post 1\n---\nContent 1')
    await fs.writeFile(path.join(postsDir, 'post2.md'), '---\ntitle: Post 2\n---\nContent 2')
    await fs.writeFile(path.join(pagesDir, 'about.md'), '---\ntitle: About\n---\nAbout page')

    const contexts = await loadSourceFiles({ sourceDir: tmpDir })

    expect(contexts).toHaveLength(3)
    expect(contexts.filter(c => c.contentType === 'post')).toHaveLength(2)
    expect(contexts.filter(c => c.contentType === 'page')).toHaveLength(1)
  })

  it('should handle missing source directory gracefully', async () => {
    const contexts = await loadSourceFiles({ sourceDir: path.join(tmpDir, 'nonexistent') })
    expect(contexts).toHaveLength(0)
  })

  it('should scan nested directories', async () => {
    const postsDir = path.join(tmpDir, '_posts', 'nested')
    await fs.mkdir(postsDir, { recursive: true })
    await fs.writeFile(path.join(postsDir, 'deep.md'), '---\ntitle: Deep\n---\nNested post')

    const contexts = await loadSourceFiles({ sourceDir: tmpDir })
    expect(contexts).toHaveLength(1)
    expect(contexts[0].frontmatter.title).toBe('Deep')
  })

  it('should only pick .md files', async () => {
    const postsDir = path.join(tmpDir, '_posts')
    await fs.mkdir(postsDir)
    await fs.writeFile(path.join(postsDir, 'post.md'), '---\ntitle: Post\n---\nOK')
    await fs.writeFile(path.join(postsDir, 'image.png'), 'binary')
    await fs.writeFile(path.join(postsDir, 'notes.txt'), 'text')

    const contexts = await loadSourceFiles({ sourceDir: tmpDir })
    expect(contexts).toHaveLength(1)
  })
})
