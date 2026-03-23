/**
 * Transformer - Convert LoadContext entries into BaseEntry with HTML
 *
 * Responsibilities:
 * - Convert Markdown to HTML using unified/remark/rehype
 * - Build BaseEntry objects with metadata
 * - Collect asset references from Markdown
 * - Extract headings for TOC
 * - Calculate reading time and excerpt
 */
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import type { LoadContext, TransformContext, BaseEntry, Post, Page, Heading, AssetRef, Tag, Category } from '@titan/types'
import type { MarkdownConfig } from '@titan/types'

/**
 * Create a Markdown processor with the given config
 */
export function createMarkdownProcessor(config: MarkdownConfig) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })

  return processor
}

/**
 * Transform a LoadContext into a TransformContext
 */
export async function transformEntry(
  loadCtx: LoadContext,
  processor: ReturnType<typeof createMarkdownProcessor>,
  sourceDir: string,
): Promise<TransformContext> {
  // Render Markdown to HTML
  const vfile = await processor.process(loadCtx.body)
  const html = String(vfile)

  // Collect asset references
  const assets = collectAssets(loadCtx.body, loadCtx.filePath)

  // Extract headings from Markdown
  const headings = extractHeadings(loadCtx.body)

  // Build slug from filename
  const slug = buildSlug(loadCtx.filePath)

  // Build the entry based on content type
  const entry = buildEntry(loadCtx, html, slug, headings, sourceDir)

  return {
    entry,
    html,
    assets,
  }
}

/**
 * Build a typed entry from LoadContext
 */
function buildEntry(
  loadCtx: LoadContext,
  html: string,
  slug: string,
  headings: Heading[],
  sourceDir: string,
): BaseEntry {
  const { frontmatter, contentType, filePath, body } = loadCtx

  const base: BaseEntry = {
    id: slug,
    slug,
    contentType,
    locale: '',
    alternates: [],
    frontmatter,
    content: body,
    html,
    path: '',
    url: '',
    assets: [],
  }

  if (contentType === 'post') {
    const post = base as unknown as Post
    post.title = String(frontmatter.title ?? '')
    post.date = frontmatter.date ? new Date(frontmatter.date as string) : new Date()
    post.updated = frontmatter.updated ? new Date(frontmatter.updated as string) : post.date
    post.tags = parseTags(frontmatter.tags)
    post.categories = parseCategories(frontmatter.categories)
    post.excerpt = generateExcerpt(body)
    post.headings = headings
    post.readingTime = calculateReadingTime(body)
    post.prev = null
    post.next = null
    post.path = `/posts/${slug}/index.html`
    post.url = `/posts/${slug}/`
    return post as unknown as BaseEntry
  }

  if (contentType === 'page') {
    const page = base as unknown as Page
    page.title = String(frontmatter.title ?? '')
    page.path = `/${slug}/index.html`
    page.url = `/${slug}/`
    return page as unknown as BaseEntry
  }

  // Generic content type
  base.path = `/${contentType}/${slug}/index.html`
  base.url = `/${contentType}/${slug}/`
  return base
}

/**
 * Build URL-friendly slug from file path
 */
function buildSlug(filePath: string): string {
  const basename = path.basename(filePath, '.md')
  // Remove date prefix if present (e.g., "2024-01-01-hello" -> "hello")
  return basename.replace(/^\d{4}-\d{2}-\d{2}-/, '')
}

/**
 * Extract headings from Markdown source
 */
function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  const regex = /^(#{1,6})\s+(.+)$/gm
  let match: RegExpExecArray | null

  while ((match = regex.exec(markdown)) !== null) {
    const depth = match[1].length as Heading['depth']
    const text = match[2].trim()
    const slug = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')

    headings.push({ depth, text, slug, children: [] })
  }

  return buildHeadingTree(headings)
}

/**
 * Build nested heading tree from flat list
 */
function buildHeadingTree(headings: Heading[]): Heading[] {
  const root: Heading[] = []
  const stack: Heading[] = []

  for (const heading of headings) {
    while (stack.length > 0 && stack[stack.length - 1].depth >= heading.depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(heading)
    } else {
      stack[stack.length - 1].children.push(heading)
    }
    stack.push(heading)
  }

  return root
}

/**
 * Collect asset references from Markdown
 */
function collectAssets(markdown: string, filePath: string): AssetRef[] {
  const assets: AssetRef[] = []
  const dir = path.dirname(filePath)

  // Match ![alt](path) and <img src="path">
  const imgRegex = /!\[[^\]]*\]\(([^)]+)\)|<img[^>]+src=["']([^"']+)["']/g
  let match: RegExpExecArray | null

  while ((match = imgRegex.exec(markdown)) !== null) {
    const originalPath = match[1] || match[2]
    // Skip external URLs
    if (originalPath.startsWith('http://') || originalPath.startsWith('https://')) continue

    assets.push({
      originalPath,
      absolutePath: path.resolve(dir, originalPath),
    })
  }

  return assets
}

/**
 * Generate excerpt from Markdown content
 */
function generateExcerpt(markdown: string, maxLength = 200): string {
  // Remove headings, images, links, code blocks
  const text = markdown
    .replace(/^#{1,6}\s+.+$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[*_~]+/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

/**
 * Calculate reading time in minutes
 */
function calculateReadingTime(markdown: string, wordsPerMinute = 200): number {
  // Count CJK characters + words
  const cjkChars = (markdown.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length
  const words = markdown.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g, '').split(/\s+/).filter(Boolean).length
  const totalWords = cjkChars + words
  return Math.max(1, Math.ceil(totalWords / wordsPerMinute))
}

function parseTags(raw: unknown): Tag[] {
  if (!Array.isArray(raw)) return []
  return raw.map((t: string) => ({
    name: t,
    slug: t.toLowerCase().replace(/\s+/g, '-'),
    count: 0,
  }))
}

function parseCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c: string) => ({
    name: c,
    slug: c.toLowerCase().replace(/\s+/g, '-'),
    count: 0,
    children: [],
  }))
}
