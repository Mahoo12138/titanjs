/**
 * Note Layout — Single note page
 *
 * Similar to post layout but with notebook-specific sidebar (tagtree)
 */
import { Slot } from '@titan/core'
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'

export default function NoteLayout(ctx: any) {
  const { site, entry, route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'note'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  if (!entry) {
    return (
      <div class="l_body content">
        <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />
        <div class="l_main" id="main">
          <p class="empty">Note not found</p>
        </div>
      </div>
    )
  }

  const title = entry.frontmatter?.title || entry.slug
  const tags: string[] = entry.frontmatter?.tags || []
  const dateStr = entry.frontmatter?.date
    ? String(entry.frontmatter.date).split('T')[0]
    : ''
  const updatedStr = entry.frontmatter?.updated
    ? String(entry.frontmatter.updated).split('T')[0]
    : ''

  return (
    <div class="l_body content note-page">
      <SidebarLeft site={site} route={route} entry={entry} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <article class="md-text content">
          <div class="article-header">
            <h1 class="article-title">{title}</h1>
            <div class="article-meta">
              {dateStr && <time class="article-date">📅 {dateStr}</time>}
              {updatedStr && <span class="article-updated"> (更新于 {updatedStr})</span>}
            </div>
            {tags.length > 0 && (
              <div class="article-tags">
                {tags.map((tag) => (
                  <span key={tag} class="tag">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          <Slot name="post:before-content" props={{ entry, site }} />

          <div class="titan-prose" dangerouslySetInnerHTML={{ __html: entry.html }} />

          <Slot name="post:after-content" props={{ entry, site }} />
        </article>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} entry={entry} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
