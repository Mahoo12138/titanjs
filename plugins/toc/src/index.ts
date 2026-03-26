/**
 * @titan/plugin-toc
 *
 * Extracts and enhances table-of-contents from headings.
 * Produces a structured TOC tree on each entry.
 *
 * Usage:
 *   import toc from '@titan/plugin-toc'
 *   export default defineConfig({
 *     plugins: [toc({ maxDepth: 3 })]
 *   })
 */
import type { PluginDefinition, TransformContext } from '@titan/types'

export interface TocItem {
  id: string
  text: string
  depth: number
  children: TocItem[]
}

export interface TocOptions {
  /** Minimum heading depth to include (default: 2, i.e. h2) */
  minDepth?: number
  /** Maximum heading depth to include (default: 4, i.e. h4) */
  maxDepth?: number
  /** Prefix for generated IDs (default: '') */
  idPrefix?: string
  /** Whether to inject anchor links into HTML (default: true) */
  injectAnchors?: boolean
}

export function pluginToc(options: TocOptions = {}): PluginDefinition {
  const {
    minDepth = 2,
    maxDepth = 4,
    idPrefix = '',
    injectAnchors = true,
  } = options

  return {
    name: '@titan/plugin-toc',

    produces: ['post.toc'],

    hooks: {
      'transform:entry': async (ctx: TransformContext, next) => {
        await next()

        const headings = extractHeadings(ctx.html, minDepth, maxDepth)
        const tree = buildTocTree(headings, idPrefix)

        // Assign toc to entry
        ;(ctx.entry as any).toc = tree

        // Optionally inject anchor links into HTML
        if (injectAnchors) {
          ctx.html = injectAnchorLinks(ctx.html, headings, idPrefix)
        }
      },
    },
  }
}

interface RawHeading {
  depth: number
  text: string
  id: string
}

/**
 * Extract headings from HTML
 */
function extractHeadings(html: string, minDepth: number, maxDepth: number): RawHeading[] {
  const headings: RawHeading[] = []
  const regex = /<h([1-6])(?:\s+id="([^"]*)")?[^>]*>([\s\S]*?)<\/h\1>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    const depth = parseInt(match[1], 10)
    if (depth < minDepth || depth > maxDepth) continue

    const existingId = match[2] || ''
    const rawText = match[3].replace(/<[^>]+>/g, '').trim()
    const id = existingId || slugify(rawText)

    headings.push({ depth, text: rawText, id })
  }

  return headings
}

/**
 * Build a nested TOC tree from flat headings list
 */
function buildTocTree(headings: RawHeading[], idPrefix: string): TocItem[] {
  const root: TocItem[] = []
  const stack: TocItem[] = []

  for (const heading of headings) {
    const item: TocItem = {
      id: idPrefix + heading.id,
      text: heading.text,
      depth: heading.depth,
      children: [],
    }

    // Pop stack until we find a parent with smaller depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= heading.depth) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(item)
    } else {
      stack[stack.length - 1].children.push(item)
    }

    stack.push(item)
  }

  return root
}

/**
 * Inject anchor links into headings that don't already have IDs
 */
function injectAnchorLinks(html: string, headings: RawHeading[], idPrefix: string): string {
  let headingIndex = 0
  return html.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/gi, (original, level, attrs = '') => {
    if (headingIndex >= headings.length) return original

    const depth = parseInt(level, 10)
    // Skip headings outside our range (they won't be in the array)
    const heading = headings[headingIndex]
    const rawText = original.replace(/<[^>]+>/g, '').trim()

    if (heading && heading.text === rawText && heading.depth === depth) {
      headingIndex++
      const id = idPrefix + heading.id
      // If already has an id attribute, leave it
      if (/\sid=/.test(attrs)) {
        return original
      }
      return `<h${level}${attrs} id="${id}">${original.match(/<h[^>]*>([\s\S]*?)<\/h/i)?.[1] || ''}</h${level}>`
    }

    return original
  })
}

/**
 * Generate a URL-safe slug from heading text
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'heading'
}

// Export helpers for testing
export { extractHeadings as _extractHeadings, buildTocTree as _buildTocTree, slugify as _slugify }

export default pluginToc
