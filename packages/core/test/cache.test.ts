import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { FileSystemCache } from '../src/cache.js'
import type { BaseEntry } from '@titan/types'

describe('FileSystemCache', () => {
  let tmpDir: string
  let cacheDir: string
  let cache: FileSystemCache

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-cache-test-'))
    cacheDir = path.join(tmpDir, '.titan-cache')
    cache = new FileSystemCache(cacheDir)
    await cache.init()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeEntry(slug: string): BaseEntry {
    return {
      id: slug,
      slug,
      contentType: 'post',
      locale: '',
      alternates: [],
      frontmatter: { title: slug },
      content: '# Hello',
      html: '<h1>Hello</h1>',
      path: `/posts/${slug}/index.html`,
      url: `/posts/${slug}/`,
      assets: [],
    }
  }

  it('should initialize cache directory', async () => {
    const stat = await fs.stat(cacheDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('should store and retrieve entries', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    await fs.writeFile(filePath, '---\ntitle: Test\n---\n# Hello')

    const entry = makeEntry('test')
    await cache.set(filePath, entry)

    const retrieved = await cache.get(filePath)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.slug).toBe('test')
  })

  it('should validate cache with matching content', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    await fs.writeFile(filePath, 'content')

    await cache.set(filePath, makeEntry('test'))
    await cache.saveManifest()

    expect(await cache.isValid(filePath)).toBe(true)
  })

  it('should invalidate cache when content changes', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    await fs.writeFile(filePath, 'original content')

    await cache.set(filePath, makeEntry('test'))
    await cache.saveManifest()

    // Modify file
    await fs.writeFile(filePath, 'modified content')

    expect(await cache.isValid(filePath)).toBe(false)
  })

  it('should return null for uncached files', async () => {
    const result = await cache.get('/nonexistent/file.md')
    expect(result).toBeNull()
  })

  it('should persist manifest across instances', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    await fs.writeFile(filePath, 'content')

    await cache.set(filePath, makeEntry('test'))
    await cache.saveManifest()

    // Create new cache instance
    const cache2 = new FileSystemCache(cacheDir)
    await cache2.init()

    expect(await cache2.isValid(filePath)).toBe(true)
    const entry = await cache2.get(filePath)
    expect(entry?.slug).toBe('test')
  })

  it('should clear all cache', async () => {
    const filePath = path.join(tmpDir, 'test.md')
    await fs.writeFile(filePath, 'content')

    await cache.set(filePath, makeEntry('test'))
    await cache.saveManifest()
    await cache.clear()

    // Cache dir should be gone
    await expect(fs.stat(cacheDir)).rejects.toThrow()
  })
})
