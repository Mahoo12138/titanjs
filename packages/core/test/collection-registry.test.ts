import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import { CollectionRegistry } from '../src/collection-registry.js'
import type { CollectionDefinition } from '@titan/types'

function makeCollectionDef(name: string, overrides: Partial<CollectionDefinition> = {}): CollectionDefinition {
  return {
    name,
    source: `source/_${name}/**/*.md`,
    schema: z.object({
      title: z.string(),
      date: z.coerce.date(),
    }),
    routes: {
      item: `/${name}/:slug`,
      list: `/${name}`,
    },
    layout: name,
    ...overrides,
  }
}

describe('CollectionRegistry', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
  })

  it('should register and retrieve collections', () => {
    registry.register(makeCollectionDef('notes'))

    expect(registry.has('notes')).toBe(true)
    expect(registry.get('notes')?.name).toBe('notes')
    expect(registry.getAll()).toHaveLength(1)
  })

  it('should throw on duplicate registration', () => {
    registry.register(makeCollectionDef('notes'))

    expect(() => registry.register(makeCollectionDef('notes'))).toThrow(
      'Collection "notes" is already registered',
    )
  })

  it('should generate item routes', () => {
    const def = makeCollectionDef('notes')
    registry.register(def)

    const entries = [
      { id: 'note1', slug: 'note1', contentType: 'notes' },
      { id: 'note2', slug: 'note2', contentType: 'notes' },
    ] as any[]

    const routes = registry.generateRoutes('notes', entries)

    const itemRoutes = routes.filter(r => r.type === 'item')
    expect(itemRoutes).toHaveLength(2)
    expect(itemRoutes[0].url).toBe('/notes/note1')
    expect(itemRoutes[1].url).toBe('/notes/note2')
  })

  it('should generate list route', () => {
    registry.register(makeCollectionDef('notes'))

    const routes = registry.generateRoutes('notes', [])
    const listRoute = routes.find(r => r.type === 'list')

    expect(listRoute).toBeDefined()
    expect(listRoute?.url).toBe('/notes/')
  })

  it('should generate paginated routes', () => {
    const def = makeCollectionDef('notes', {
      routes: {
        item: '/notes/:slug',
        paginate: { size: 2, path: '/notes/page/:n' },
      },
    })
    registry.register(def)

    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`,
      slug: `n${i}`,
      contentType: 'notes',
    })) as any[]

    const routes = registry.generateRoutes('notes', entries)
    const paginated = routes.filter(r => r.type === 'paginated')

    expect(paginated).toHaveLength(3) // ceil(5/2) = 3
    expect(paginated[0].pagination?.current).toBe(1)
    expect(paginated[0].pagination?.prev).toBeNull()
    expect(paginated[0].pagination?.next).toBe('/notes/page/2')
    expect(paginated[2].pagination?.current).toBe(3)
    expect(paginated[2].pagination?.next).toBeNull()
  })

  it('should throw for unknown collection', () => {
    expect(() => registry.generateRoutes('unknown', [])).toThrow(
      'Unknown collection: "unknown"',
    )
  })
})

describe('CollectionRegistry file loading', () => {
  let tmpDir: string
  let registry: CollectionRegistry

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-collection-test-'))
    registry = new CollectionRegistry()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should load and validate files', async () => {
    const notesDir = path.join(tmpDir, 'source', '_notes')
    await fs.mkdir(notesDir, { recursive: true })
    await fs.writeFile(
      path.join(notesDir, 'note1.md'),
      '---\ntitle: Note 1\ndate: 2024-01-15\n---\n# Note 1',
    )
    await fs.writeFile(
      path.join(notesDir, 'note2.md'),
      '---\ntitle: Note 2\ndate: 2024-02-01\n---\n# Note 2',
    )

    registry.register(makeCollectionDef('notes'))
    const contexts = await registry.loadFiles('notes', tmpDir)

    expect(contexts).toHaveLength(2)
    expect(contexts[0].contentType).toBe('notes')
    expect(contexts[0].frontmatter.title).toBe('Note 1')
  })

  it('should throw on invalid frontmatter', async () => {
    const notesDir = path.join(tmpDir, 'source', '_notes')
    await fs.mkdir(notesDir, { recursive: true })
    await fs.writeFile(
      path.join(notesDir, 'bad.md'),
      '---\nno_title: oops\n---\nContent',
    )

    registry.register(makeCollectionDef('notes'))

    await expect(registry.loadFiles('notes', tmpDir)).rejects.toThrow(
      'Validation failed',
    )
  })

  it('should handle empty collection directory', async () => {
    // Don't create any files
    registry.register(makeCollectionDef('notes'))
    const contexts = await registry.loadFiles('notes', tmpDir)
    expect(contexts).toHaveLength(0)
  })
})
