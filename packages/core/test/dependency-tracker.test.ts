import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { DependencyTracker, hashFile, hashData } from '../src/dependency-tracker.js'
import type { EntryDependencies } from '../src/dependency-tracker.js'

describe('DependencyTracker', () => {
  let tmpDir: string
  let cacheDir: string
  let tracker: DependencyTracker

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-deps-test-'))
    cacheDir = path.join(tmpDir, '.cache')
    tracker = new DependencyTracker(cacheDir)
    await tracker.init()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeDeps(overrides: Partial<EntryDependencies> = {}): EntryDependencies {
    return {
      fileHash: 'abc123',
      tagSlugs: [],
      categorySlugs: [],
      singletonNames: [],
      layoutName: 'post',
      ...overrides,
    }
  }

  it('should always rebuild on first build (no previous)', () => {
    expect(tracker.needsRebuild('entry1', makeDeps())).toBe(true)
  })

  it('should detect file hash changes', async () => {
    // Simulate a previous build
    tracker.recordEntry('entry1', makeDeps({ fileHash: 'hash1' }))
    tracker.recordTagCounts({})
    tracker.recordCategoryCounts({})
    await tracker.save()

    // New build
    const tracker2 = new DependencyTracker(cacheDir)
    await tracker2.init()
    tracker2.recordTagCounts({})
    tracker2.recordCategoryCounts({})

    // Same hash → no rebuild
    expect(tracker2.needsRebuild('entry1', makeDeps({ fileHash: 'hash1' }))).toBe(false)

    // Changed hash → rebuild
    expect(tracker2.needsRebuild('entry1', makeDeps({ fileHash: 'hash2' }))).toBe(true)
  })

  it('should detect tag count changes', async () => {
    tracker.recordEntry('entry1', makeDeps({
      fileHash: 'hash1',
      tagSlugs: ['typescript'],
    }))
    tracker.recordTagCounts({ typescript: 5 })
    tracker.recordCategoryCounts({})
    await tracker.save()

    const tracker2 = new DependencyTracker(cacheDir)
    await tracker2.init()
    tracker2.recordTagCounts({ typescript: 6 })  // count changed
    tracker2.recordCategoryCounts({})

    expect(tracker2.needsRebuild('entry1', makeDeps({
      fileHash: 'hash1',
      tagSlugs: ['typescript'],
    }))).toBe(true)
  })

  it('should detect singleton hash changes', async () => {
    tracker.recordEntry('entry1', makeDeps({
      fileHash: 'hash1',
      singletonNames: ['profile'],
    }))
    tracker.recordSingletonHash('profile', 'shash1')
    tracker.recordTagCounts({})
    tracker.recordCategoryCounts({})
    await tracker.save()

    const tracker2 = new DependencyTracker(cacheDir)
    await tracker2.init()
    tracker2.recordSingletonHash('profile', 'shash2')  // singleton changed
    tracker2.recordTagCounts({})
    tracker2.recordCategoryCounts({})

    expect(tracker2.needsRebuild('entry1', makeDeps({
      fileHash: 'hash1',
      singletonNames: ['profile'],
    }))).toBe(true)
  })

  it('should detect layout hash changes', async () => {
    tracker.recordEntry('entry1', makeDeps({ fileHash: 'hash1', layoutName: 'post' }))
    tracker.recordLayoutHash('post', 'lhash1')
    tracker.recordTagCounts({})
    tracker.recordCategoryCounts({})
    await tracker.save()

    const tracker2 = new DependencyTracker(cacheDir)
    await tracker2.init()
    tracker2.recordLayoutHash('post', 'lhash2')  // layout changed
    tracker2.recordTagCounts({})
    tracker2.recordCategoryCounts({})

    expect(tracker2.needsRebuild('entry1', makeDeps({
      fileHash: 'hash1',
      layoutName: 'post',
    }))).toBe(true)
  })

  it('should report no rebuild when nothing changed', async () => {
    const deps = makeDeps({
      fileHash: 'hash1',
      tagSlugs: ['ts'],
      singletonNames: ['profile'],
      layoutName: 'post',
    })
    tracker.recordEntry('entry1', deps)
    tracker.recordTagCounts({ ts: 3 })
    tracker.recordCategoryCounts({})
    tracker.recordSingletonHash('profile', 'shash1')
    tracker.recordLayoutHash('post', 'lhash1')
    await tracker.save()

    const tracker2 = new DependencyTracker(cacheDir)
    await tracker2.init()
    tracker2.recordTagCounts({ ts: 3 })
    tracker2.recordCategoryCounts({})
    tracker2.recordSingletonHash('profile', 'shash1')
    tracker2.recordLayoutHash('post', 'lhash1')

    expect(tracker2.needsRebuild('entry1', deps)).toBe(false)
  })

  it('getChangedEntries should return only changed ones', async () => {
    tracker.recordEntry('a', makeDeps({ fileHash: 'h1' }))
    tracker.recordEntry('b', makeDeps({ fileHash: 'h2' }))
    tracker.recordTagCounts({})
    tracker.recordCategoryCounts({})
    await tracker.save()

    const tracker2 = new DependencyTracker(cacheDir)
    await tracker2.init()
    tracker2.recordTagCounts({})
    tracker2.recordCategoryCounts({})

    const allDeps = new Map([
      ['a', makeDeps({ fileHash: 'h1' })],     // unchanged
      ['b', makeDeps({ fileHash: 'h3' })],     // changed
      ['c', makeDeps({ fileHash: 'h4' })],     // new
    ])

    const changed = tracker2.getChangedEntries(allDeps)
    expect(changed).toContain('b')
    expect(changed).toContain('c')
    expect(changed).not.toContain('a')
  })
})

describe('hashFile / hashData', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-hash-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should produce consistent file hashes', async () => {
    const filePath = path.join(tmpDir, 'test.txt')
    await fs.writeFile(filePath, 'hello world')

    const hash1 = await hashFile(filePath)
    const hash2 = await hashFile(filePath)

    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(16)
  })

  it('should produce different hashes for different content', async () => {
    const f1 = path.join(tmpDir, 'a.txt')
    const f2 = path.join(tmpDir, 'b.txt')
    await fs.writeFile(f1, 'hello')
    await fs.writeFile(f2, 'world')

    const hash1 = await hashFile(f1)
    const hash2 = await hashFile(f2)

    expect(hash1).not.toBe(hash2)
  })

  it('should hash arbitrary data', () => {
    const hash1 = hashData({ a: 1, b: 2 })
    const hash2 = hashData({ a: 1, b: 2 })
    const hash3 = hashData({ a: 1, b: 3 })

    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
    expect(hash1).toHaveLength(16)
  })
})
