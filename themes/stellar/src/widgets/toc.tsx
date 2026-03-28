/**
 * TOC Widget — Table of Contents
 *
 * Renders the heading tree from the current entry's headings.
 */

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

  configSchema: {
    parse: (v: any) => ({
      listNumber: v?.listNumber ?? false,
      minDepth: v?.minDepth ?? 2,
      maxDepth: v?.maxDepth ?? 4,
      collapse: v?.collapse ?? false,
    }),
    safeParse: (v: any) => {
      try {
        return { success: true, data: tocWidget.configSchema.parse(v) }
      } catch (e) {
        return { success: false, error: { issues: [{ message: String(e) }] } }
      }
    },
  },

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
