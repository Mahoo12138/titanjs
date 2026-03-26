import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { loadTheme, resolveLayout } from '../src/theme-loader.js'
import type { ResolvedTheme, BaseEntry, PluginDefinition } from '@titan/types'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-theme-'))
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

/**
 * Custom importer that reads JS files as text and evaluates them,
 * since vitest/Vite can't dynamically import from /tmp.
 */
async function testImporter(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf-8')
  // Simple CommonJS-like eval for test modules
  const module = { exports: {} as any }
  const fn = new Function('module', 'exports', content.replace(/export default /, 'module.exports.default = '))
  fn(module, module.exports)
  return module.exports
}

async function createThemeFiles(name = 'test-theme') {
  const themeDir = path.join(tmpDir, 'themes', name)
  await fs.mkdir(path.join(themeDir, 'layouts'), { recursive: true })

  // theme.config.mjs - use module.exports style for testImporter
  await fs.writeFile(
    path.join(themeDir, 'theme.config.mjs'),
    `module.exports.default = {
  name: '${name}',
  version: '1.0.0',
  slots: {
    'post:after-content': { description: 'After post content', mode: 'stack' },
  },
  typeLayoutMap: { post: 'post', page: 'page' },
}\n`,
  )

  // default layout
  await fs.writeFile(
    path.join(themeDir, 'layouts', 'default.mjs'),
    `module.exports.default = function Default(ctx) { return { type: 'div', props: { children: 'default' } } }\n`,
  )

  // post layout
  await fs.writeFile(
    path.join(themeDir, 'layouts', 'post.mjs'),
    `module.exports.default = function PostLayout(ctx) { return { type: 'article', props: { children: 'post' } } }\n`,
  )

  return themeDir
}

describe('Theme Loader', () => {
  it('loadTheme returns null when no theme ref provided', async () => {
    const result = await loadTheme(undefined, tmpDir, [])
    expect(result).toBeNull()
  })

  it('loadTheme loads a theme from themes/ directory', async () => {
    await createThemeFiles('my-theme')

    const result = await loadTheme('my-theme', tmpDir, [], undefined, testImporter)
    expect(result!.definition.name).toBe('my-theme')
    expect(result!.definition.version).toBe('1.0.0')
    expect(result!.layouts.has('default')).toBe(true)
    expect(result!.layouts.has('post')).toBe(true)
  })

  it('loadTheme merges typeLayoutMap from defaults and theme', async () => {
    await createThemeFiles()

    const result = await loadTheme('test-theme', tmpDir, [], undefined, testImporter)
    expect(result!.typeLayoutMap.post).toBe('post')
    expect(result!.typeLayoutMap.page).toBe('page')
    // Defaults that the theme doesn't override
    expect(result!.typeLayoutMap.tag).toBe('tag')
    expect(result!.typeLayoutMap.category).toBe('category')
  })

  it('loadTheme throws for unknown theme name', async () => {
    await expect(loadTheme('nonexistent', tmpDir, [])).rejects.toThrow('not found')
  })

  it('loadTheme collects slot components from plugins', async () => {
    await createThemeFiles()

    const plugin: PluginDefinition = {
      name: 'test-plugin',
      slotComponents: [
        {
          slot: 'post:after-content',
          component: () => null,
          order: 10,
        },
      ],
    }

    const result = await loadTheme('test-theme', tmpDir, [plugin], undefined, testImporter)
    expect(result!.slotComponents.get('post:after-content')!.length).toBe(1)
  })

  it('loadTheme rejects slot components targeting undeclared slots', async () => {
    await createThemeFiles()

    const plugin: PluginDefinition = {
      name: 'bad-plugin',
      slotComponents: [
        {
          slot: 'nonexistent:slot',
          component: () => null,
        },
      ],
    }

    await expect(loadTheme('test-theme', tmpDir, [plugin], undefined, testImporter)).rejects.toThrow('Slot mismatch')
  })

  it('loadTheme works with object theme reference', async () => {
    await createThemeFiles('obj-theme')

    const result = await loadTheme({ name: 'obj-theme' }, tmpDir, [], undefined, testImporter)
    expect(result).not.toBeNull()
    expect(result!.definition.name).toBe('obj-theme')
  })
})

describe('resolveLayout', () => {
  function makeTheme(overrides: Partial<ResolvedTheme> = {}): ResolvedTheme {
    return {
      definition: { name: 'test' },
      config: {},
      layouts: new Map([
        ['default', { default: () => null }],
        ['post', { default: () => null }],
        ['page', { default: () => null }],
      ]),
      slotComponents: new Map(),
      typeLayoutMap: { post: 'post', page: 'page' },
      rootDir: '/tmp/theme',
      ...overrides,
    }
  }

  function makeEntry(overrides: Partial<BaseEntry> = {}): BaseEntry {
    return {
      id: 'test',
      slug: 'test',
      title: 'Test',
      contentType: 'post',
      sourcePath: '/test.md',
      raw: '',
      content: '',
      html: '',
      frontmatter: {},
      date: new Date(),
      url: '/test/',
      outputPath: 'test/index.html',
      assets: [],
      headings: [],
      wordCount: 0,
      readingTime: 1,
      ...overrides,
    }
  }

  it('uses frontmatter layout when specified', () => {
    const theme = makeTheme()
    const entry = makeEntry({ frontmatter: { layout: 'custom' } })
    expect(resolveLayout(entry, theme)).toBe('custom')
  })

  it('uses typeLayoutMap for content type', () => {
    const theme = makeTheme()
    const entry = makeEntry({ contentType: 'post', frontmatter: {} })
    expect(resolveLayout(entry, theme)).toBe('post')
  })

  it('falls back to default when no mapping exists', () => {
    const theme = makeTheme({ typeLayoutMap: {} })
    const entry = makeEntry({ contentType: 'unknown', frontmatter: {} })
    expect(resolveLayout(entry, theme)).toBe('default')
  })

  it('falls back to default when mapped layout does not exist', () => {
    const theme = makeTheme({
      typeLayoutMap: { post: 'missing-layout' },
      layouts: new Map([['default', { default: () => null }]]),
    })
    const entry = makeEntry({ contentType: 'post', frontmatter: {} })
    expect(resolveLayout(entry, theme)).toBe('default')
  })
})
