/**
 * Categories Index Layout — All categories overview
 */
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'
import { NavTabs } from '../components/NavTabs.js'

export default function CategoriesLayout(ctx: any) {
  const { site, categories = [], route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'category'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  const sortedCats = [...categories].sort((a: any, b: any) =>
    (a.name || '').localeCompare(b.name || ''),
  )

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <NavTabs current="/categories/" />
        <div class="main-content">
          {sortedCats.length > 0
            ? <div class="category-list-page">
                {sortedCats.map((cat: any) => (
                  <a key={cat.slug} class="category-item" href={`/categories/${cat.slug}/`}>
                    <span class="name">📁 {cat.name}</span>
                    <span class="badge">({cat.count || 0})</span>
                  </a>
                ))}
              </div>
            : <p class="empty">暂无分类</p>
          }
        </div>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
