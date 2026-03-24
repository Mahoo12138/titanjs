import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import { SingletonRegistry } from '../src/singleton-registry.js'

describe('SingletonRegistry', () => {
  let tmpDir: string
  let registry: SingletonRegistry

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-singleton-test-'))
    registry = new SingletonRegistry()
    registry.setCacheDir(path.join(tmpDir, '.cache'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should register and check singletons', () => {
    registry.register({
      name: 'profile',
      source: 'data/profile.json',
      schema: z.object({ name: z.string() }),
    })

    expect(registry.has('profile')).toBe(true)
    expect(registry.has('unknown')).toBe(false)
    expect(registry.getAll()).toHaveLength(1)
  })

  it('should throw on duplicate registration', () => {
    registry.register({
      name: 'profile',
      source: 'data/profile.json',
      schema: z.object({ name: z.string() }),
    })

    expect(() =>
      registry.register({
        name: 'profile',
        source: 'data/other.json',
        schema: z.object({ name: z.string() }),
      }),
    ).toThrow('Singleton "profile" is already registered')
  })

  it('should load from JSON file', async () => {
    const dataDir = path.join(tmpDir, 'data')
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      path.join(dataDir, 'friends.json'),
      JSON.stringify([
        { name: 'Alice', url: 'https://alice.dev' },
        { name: 'Bob', url: 'https://bob.dev' },
      ]),
    )

    registry.register({
      name: 'friends',
      source: 'data/friends.json',
      schema: z.array(z.object({ name: z.string(), url: z.string() })),
    })

    const data = await registry.resolve('friends', tmpDir)
    expect(data).toHaveLength(2)
    expect((data as any)[0].name).toBe('Alice')
  })

  it('should load from Markdown file', async () => {
    const dataDir = path.join(tmpDir, 'data')
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      path.join(dataDir, 'profile.md'),
      '---\nname: John\nbio: Developer\n---\n# Bio\n\nHello world',
    )

    registry.register({
      name: 'profile',
      source: 'data/profile.md',
      schema: z.object({
        name: z.string(),
        bio: z.string(),
        content: z.string(),
      }),
    })

    const data = (await registry.resolve('profile', tmpDir)) as any
    expect(data.name).toBe('John')
    expect(data.bio).toBe('Developer')
    expect(data.content).toContain('# Bio')
  })

  it('should load from async function', async () => {
    registry.register({
      name: 'stats',
      source: async () => ({ repos: 42, followers: 100 }),
      schema: z.object({ repos: z.number(), followers: z.number() }),
    })

    const data = (await registry.resolve('stats', tmpDir)) as any
    expect(data.repos).toBe(42)
    expect(data.followers).toBe(100)
  })

  it('should use fallback when async source fails', async () => {
    registry.register({
      name: 'stats',
      source: async () => {
        throw new Error('Network error')
      },
      schema: z.object({ repos: z.number() }),
      fallback: { repos: 0 },
    })

    const data = (await registry.resolve('stats', tmpDir)) as any
    expect(data.repos).toBe(0)
  })

  it('should throw when async fails without fallback', async () => {
    registry.register({
      name: 'stats',
      source: async () => {
        throw new Error('Network error')
      },
      schema: z.object({ repos: z.number() }),
    })

    await expect(registry.resolve('stats', tmpDir)).rejects.toThrow('Network error')
  })

  it('should throw on schema validation failure', async () => {
    const dataDir = path.join(tmpDir, 'data')
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(
      path.join(dataDir, 'bad.json'),
      JSON.stringify({ wrong: 'fields' }),
    )

    registry.register({
      name: 'bad',
      source: 'data/bad.json',
      schema: z.object({ name: z.string() }),
    })

    await expect(registry.resolve('bad', tmpDir)).rejects.toThrow(
      'validation failed',
    )
  })

  it('should resolve all singletons', async () => {
    registry.register({
      name: 'a',
      source: async () => ({ value: 1 }),
      schema: z.object({ value: z.number() }),
    })
    registry.register({
      name: 'b',
      source: async () => ({ value: 2 }),
      schema: z.object({ value: z.number() }),
    })

    const all = await registry.resolveAll(tmpDir)
    expect(all.size).toBe(2)
    expect((all.get('a') as any).value).toBe(1)
    expect((all.get('b') as any).value).toBe(2)
  })

  it('should cache resolved data within a build', async () => {
    let callCount = 0
    registry.register({
      name: 'counter',
      source: async () => {
        callCount++
        return { count: callCount }
      },
      schema: z.object({ count: z.number() }),
    })

    await registry.resolve('counter', tmpDir)
    await registry.resolve('counter', tmpDir)

    expect(callCount).toBe(1) // Called only once
  })

  it('should use persistent cache for async sources', async () => {
    let callCount = 0
    const def = {
      name: 'cached',
      source: async () => {
        callCount++
        return { value: callCount }
      },
      schema: z.object({ value: z.number() }),
      cache: 'persistent' as const,
      cacheTTL: 60_000,
    }

    registry.register(def)
    const data1 = await registry.resolve('cached', tmpDir)
    expect((data1 as any).value).toBe(1)

    // Create a new registry (simulating a new build)
    const registry2 = new SingletonRegistry()
    registry2.setCacheDir(path.join(tmpDir, '.cache'))
    registry2.register({
      ...def,
      source: async () => {
        callCount++
        return { value: callCount }
      },
    })

    const data2 = await registry2.resolve('cached', tmpDir)
    // Should use cached value, not call the function again
    expect((data2 as any).value).toBe(1)
    expect(callCount).toBe(1)
  })
})
