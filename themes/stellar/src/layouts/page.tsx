/**
 * Page Layout — Single page (About, etc.)
 */
import { Slot } from '@titan/core'
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'

export default function PageLayout(ctx: any) {
  const { site, page, route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'page'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  return (
    <div class="l_body content">
      <SidebarLeft site={site} route={route} entry={page} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <article class="md-text content">
          {page.title && <h1 class="article-title">{page.title}</h1>}

          <Slot name="post:before-content" props={{ page, site }} />

          <div class="titan-prose" dangerouslySetInnerHTML={{ __html: page.html }} />

          <Slot name="post:after-content" props={{ page, site }} />
        </article>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} entry={page} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
