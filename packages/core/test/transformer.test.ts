import { describe, it, expect } from 'vitest'
import { createMarkdownProcessor, transformEntry } from '../src/transformer.js'
import type { LoadContext } from '@titan/types'

describe('Transformer', () => {
  const processor = createMarkdownProcessor({
    remarkPlugins: [],
    rehypePlugins: [],
  })

  function makeLoadContext(overrides: Partial<LoadContext> = {}): LoadContext {
    return {
      filePath: '/test/source/_posts/2024-01-15-hello.md',
      rawContent: '',
      frontmatter: { title: 'Hello', date: '2024-01-15' },
      contentType: 'post',
      body: '# Hello\n\nWorld',
      ...overrides,
    }
  }

  it('should render Markdown to HTML', async () => {
    const ctx = await transformEntry(makeLoadContext(), processor, '/test/source')

    expect(ctx.html).toContain('<h1>Hello</h1>')
    expect(ctx.html).toContain('<p>World</p>')
  })

  it('should build slug from filename, stripping date prefix', async () => {
    const ctx = await transformEntry(makeLoadContext(), processor, '/test/source')

    expect(ctx.entry.slug).toBe('hello')
  })

  it('should keep slug as-is when no date prefix', async () => {
    const ctx = await transformEntry(
      makeLoadContext({ filePath: '/test/source/_posts/about-me.md' }),
      processor,
      '/test/source',
    )

    expect(ctx.entry.slug).toBe('about-me')
  })

  it('should populate post fields from frontmatter', async () => {
    const loadCtx = makeLoadContext({
      frontmatter: {
        title: 'My Post',
        date: '2024-03-01',
        tags: ['typescript', 'ssg'],
        categories: ['tech'],
      },
    })

    const ctx = await transformEntry(loadCtx, processor, '/test/source')
    const entry = ctx.entry as any

    expect(entry.title).toBe('My Post')
    expect(entry.date).toBeInstanceOf(Date)
    expect(entry.tags).toHaveLength(2)
    expect(entry.tags[0].name).toBe('typescript')
    expect(entry.categories).toHaveLength(1)
    expect(entry.categories[0].name).toBe('tech')
  })

  it('should extract headings from Markdown', async () => {
    const body = '# Title\n\n## Section 1\n\n### Sub 1.1\n\n## Section 2'
    const ctx = await transformEntry(
      makeLoadContext({ body }),
      processor,
      '/test/source',
    )
    const entry = ctx.entry as any

    // h1 is root node, h2s are its children
    expect(entry.headings).toHaveLength(1)
    expect(entry.headings[0].text).toBe('Title')
    expect(entry.headings[0].children).toHaveLength(2)
  })

  it('should calculate reading time', async () => {
    // ~200 words = 1 min
    const words = Array(300).fill('word').join(' ')
    const ctx = await transformEntry(
      makeLoadContext({ body: words }),
      processor,
      '/test/source',
    )
    const entry = ctx.entry as any

    expect(entry.readingTime).toBe(2) // 300 words / 200 wpm = 1.5 → ceil = 2
  })

  it('should generate excerpt', async () => {
    const body = 'This is the first paragraph with some content.\n\n# Heading\n\nMore content here.'
    const ctx = await transformEntry(
      makeLoadContext({ body }),
      processor,
      '/test/source',
    )
    const entry = ctx.entry as any

    expect(entry.excerpt).toContain('This is the first paragraph')
  })

  it('should collect local asset references', async () => {
    const body = '![photo](./images/pic.png)\n\n![external](https://example.com/img.jpg)'
    const ctx = await transformEntry(
      makeLoadContext({ body }),
      processor,
      '/test/source',
    )

    expect(ctx.assets).toHaveLength(1)
    expect(ctx.assets[0].originalPath).toBe('./images/pic.png')
  })

  it('should handle page content type', async () => {
    const ctx = await transformEntry(
      makeLoadContext({
        contentType: 'page',
        filePath: '/test/source/_pages/about.md',
        frontmatter: { title: 'About' },
      }),
      processor,
      '/test/source',
    )

    expect(ctx.entry.contentType).toBe('page')
    expect(ctx.entry.url).toBe('/about/')
  })

  it('should render bold, italic, and code', async () => {
    const body = '**bold** *italic* `code`'
    const ctx = await transformEntry(
      makeLoadContext({ body }),
      processor,
      '/test/source',
    )

    expect(ctx.html).toContain('<strong>bold</strong>')
    expect(ctx.html).toContain('<em>italic</em>')
    expect(ctx.html).toContain('<code>code</code>')
  })
})
