/**
 * TOC Widget — Table of Contents
 *
 * Renders the heading tree from the current entry's headings.
 */
import { z } from 'zod'

function renderTocList(headings: any[], config: any): any {
  return (
    <ol class={config.listNumber ? 'toc-list numbered' : 'toc-list'}>
      {headings.map((heading: any) => (
        <li key={heading.slug} class={`toc-item depth-${heading.depth}`}>
          <a class="toc-link" href={`#${heading.slug}`}>{heading.text}</a>
          {heading.children && heading.children.length > 0
            ? renderTocList(heading.children, config)
            : null}
        </li>
      ))}
    </ol>
  )
}

export const tocWidget = {
  name: 'toc',

  configSchema: z.object({
    listNumber: z.boolean().default(false),
    minDepth: z.number().default(2),
    maxDepth: z.number().default(4),
    collapse: z.boolean().default(false),
  }),

  component: function TocWidget(ctx: any) {
    const { config, entry } = ctx
    const headings: any[] = entry?.headings || entry?.frontmatter?.headings || []

    if (!headings || headings.length === 0) return null

    const filtered = headings.filter(
      (h: any) => h.depth >= config.minDepth && h.depth <= config.maxDepth,
    )

    if (filtered.length === 0) return null

    return (
      <widget class="widget-wrapper toc">
        <div class="widget-header">
          <span class="name">目录</span>
        </div>
        <div class="widget-body">
          <nav class="toc-nav">
            {renderTocList(filtered, config)}
          </nav>
        </div>
        <div class="widget-footer">
          <a class="top" href="#">↑ Top</a>
        </div>
      </widget>
    )
  },
}
