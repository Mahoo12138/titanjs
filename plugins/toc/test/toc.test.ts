import { describe, it, expect } from 'vitest'
import { pluginToc, _extractHeadings, _buildTocTree, _slugify } from '../src/index.js'
import type { TransformContext } from '@titan/types'

describe('plugin-toc', () => {
  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginToc()
    expect(plugin.name).toBe('@titan/plugin-toc')
    expect(plugin.hooks!['transform:entry']).toBeDefined()
  })

  describe('slugify', () => {
    it('should convert text to lowercase slug', () => {
      expect(_slugify('Hello World')).toBe('hello-world')
    })

    it('should handle special characters', () => {
      expect(_slugify('What is TypeScript?')).toBe('what-is-typescript')
    })

    it('should handle CJK characters', () => {
      expect(_slugify('安装指南')).toBe('安装指南')
    })

    it('should handle mixed content', () => {
      expect(_slugify('Step 1: 安装')).toBe('step-1-安装')
    })

    it('should return "heading" for empty text', () => {
      expect(_slugify('')).toBe('heading')
    })
  })

  describe('extractHeadings', () => {
    it('should extract h2-h4 headings by default', () => {
      const html = `
        <h1>Title</h1>
        <h2>Section 1</h2>
        <h3>Subsection</h3>
        <h4>Detail</h4>
        <h5>Too deep</h5>
      `
      const headings = _extractHeadings(html, 2, 4)
      expect(headings).toHaveLength(3)
      expect(headings[0]).toEqual({ depth: 2, text: 'Section 1', id: 'section-1' })
      expect(headings[1]).toEqual({ depth: 3, text: 'Subsection', id: 'subsection' })
      expect(headings[2]).toEqual({ depth: 4, text: 'Detail', id: 'detail' })
    })

    it('should respect existing id attributes', () => {
      const html = '<h2 id="custom-id">Title</h2>'
      const headings = _extractHeadings(html, 2, 4)
      expect(headings[0].id).toBe('custom-id')
    })

    it('should strip inline HTML tags from heading text', () => {
      const html = '<h2>Hello <code>world</code></h2>'
      const headings = _extractHeadings(html, 2, 4)
      expect(headings[0].text).toBe('Hello world')
    })
  })

  describe('buildTocTree', () => {
    it('should build a flat list for same-depth headings', () => {
      const headings = [
        { depth: 2, text: 'A', id: 'a' },
        { depth: 2, text: 'B', id: 'b' },
        { depth: 2, text: 'C', id: 'c' },
      ]
      const tree = _buildTocTree(headings, '')
      expect(tree).toHaveLength(3)
      expect(tree[0].children).toHaveLength(0)
    })

    it('should nest children under parent headings', () => {
      const headings = [
        { depth: 2, text: 'Parent', id: 'parent' },
        { depth: 3, text: 'Child 1', id: 'child-1' },
        { depth: 3, text: 'Child 2', id: 'child-2' },
      ]
      const tree = _buildTocTree(headings, '')
      expect(tree).toHaveLength(1)
      expect(tree[0].text).toBe('Parent')
      expect(tree[0].children).toHaveLength(2)
      expect(tree[0].children[0].text).toBe('Child 1')
    })

    it('should handle multiple levels of nesting', () => {
      const headings = [
        { depth: 2, text: 'H2', id: 'h2' },
        { depth: 3, text: 'H3', id: 'h3' },
        { depth: 4, text: 'H4', id: 'h4' },
      ]
      const tree = _buildTocTree(headings, '')
      expect(tree).toHaveLength(1)
      expect(tree[0].children).toHaveLength(1)
      expect(tree[0].children[0].children).toHaveLength(1)
    })

    it('should apply id prefix', () => {
      const headings = [{ depth: 2, text: 'Hi', id: 'hi' }]
      const tree = _buildTocTree(headings, 'toc-')
      expect(tree[0].id).toBe('toc-hi')
    })

    it('should handle sibling after nested section', () => {
      const headings = [
        { depth: 2, text: 'A', id: 'a' },
        { depth: 3, text: 'A.1', id: 'a1' },
        { depth: 2, text: 'B', id: 'b' },
      ]
      const tree = _buildTocTree(headings, '')
      expect(tree).toHaveLength(2)
      expect(tree[0].children).toHaveLength(1)
      expect(tree[1].text).toBe('B')
      expect(tree[1].children).toHaveLength(0)
    })
  })

  describe('transform:entry hook', () => {
    it('should set toc on entry', async () => {
      const plugin = pluginToc()
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<h2>Section 1</h2><p>Content</p><h3>Sub</h3><p>More</p>',
        assets: [],
      }

      await plugin.hooks!['transform:entry']!(ctx, async () => {})

      expect(entry.toc).toBeDefined()
      expect(entry.toc).toHaveLength(1)
      expect(entry.toc[0].text).toBe('Section 1')
      expect(entry.toc[0].children).toHaveLength(1)
      expect(entry.toc[0].children[0].text).toBe('Sub')
    })

    it('should inject anchor IDs into HTML', async () => {
      const plugin = pluginToc({ injectAnchors: true })
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<h2>Hello World</h2>',
        assets: [],
      }

      await plugin.hooks!['transform:entry']!(ctx, async () => {})

      expect(ctx.html).toContain('id="hello-world"')
    })

    it('should not inject anchors when disabled', async () => {
      const plugin = pluginToc({ injectAnchors: false })
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const originalHtml = '<h2>Hello World</h2>'
      const ctx: TransformContext = {
        entry,
        html: originalHtml,
        assets: [],
      }

      await plugin.hooks!['transform:entry']!(ctx, async () => {})

      expect(ctx.html).toBe(originalHtml)
      expect(entry.toc).toBeDefined()
    })

    it('should respect maxDepth option', async () => {
      const plugin = pluginToc({ maxDepth: 2 })
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<h2>A</h2><h3>B</h3><h4>C</h4>',
        assets: [],
      }

      await plugin.hooks!['transform:entry']!(ctx, async () => {})

      // Only h2 should be included (maxDepth=2 means only h2)
      expect(entry.toc).toHaveLength(1)
      expect(entry.toc[0].children).toHaveLength(0)
    })

    it('should call next()', async () => {
      const plugin = pluginToc()
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<p>No headings</p>',
        assets: [],
      }

      let nextCalled = false
      await plugin.hooks!['transform:entry']!(ctx, async () => { nextCalled = true })

      expect(nextCalled).toBe(true)
    })
  })
})
