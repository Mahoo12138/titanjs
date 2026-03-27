/**
 * Wiki Layout — Single wiki doc page
 *
 * Three-column: doc tree sidebar | content | toc sidebar
 */
import { Slot } from '@titan/core'
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'

export default function WikiLayout(ctx: any) {
  const { site, entry, route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'wiki'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  if (!entry) {
    return (
      <div class="l_body content">
        <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />
        <div class="l_main" id="main">
          <p class="empty">Wiki page not found</p>
        </div>
      </div>
    )
  }

  const title = entry.frontmatter?.title || entry.slug

  return (
    <div class="l_body content wiki-page">
      <SidebarLeft site={site} route={route} entry={entry} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <article class="md-text content">
          <div class="article-header">
            <h1 class="article-title">{title}</h1>
          </div>

          <Slot name="post:before-content" props={{ entry, site }} />

          <div class="titan-prose" dangerouslySetInnerHTML={{ __html: entry.html }} />

          <Slot name="post:after-content" props={{ entry, site }} />

          {(entry.wikiPrev || entry.wikiNext) && (
            <nav class="read-next">
              {entry.wikiPrev
                ? <a class="prev-post" href={entry.wikiPrev.url}>
                    <span class="label">← 上一页</span>
                    <span class="title">{entry.wikiPrev.title}</span>
                  </a>
                : <span class="prev-post empty" />
              }
              {entry.wikiNext
                ? <a class="next-post" href={entry.wikiNext.url}>
                    <span class="label">下一页 →</span>
                    <span class="title">{entry.wikiNext.title}</span>
                  </a>
                : <span class="next-post empty" />
              }
            </nav>
          )}
        </article>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} entry={entry} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
