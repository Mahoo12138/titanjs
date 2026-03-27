/**
 * Tags Index Layout — All tags overview
 */
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'
import { NavTabs } from '../components/NavTabs.js'

export default function TagsLayout(ctx: any) {
  const { site, tags = [], route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'tag'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  const sortedTags = [...tags].sort((a: any, b: any) => (b.count || 0) - (a.count || 0))

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <NavTabs current="/tags/" />
        <div class="main-content">
          {sortedTags.length > 0
            ? <div class="tag-list-page">
                {sortedTags.map((tag: any) => (
                  <a key={tag.slug} class="tag-item" href={`/tags/${tag.slug}/`}>
                    <span class="name">{tag.name}</span>
                    <span class="badge">{tag.count || 0}</span>
                  </a>
                ))}
              </div>
            : <p class="empty">暂无标签</p>
          }
        </div>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
