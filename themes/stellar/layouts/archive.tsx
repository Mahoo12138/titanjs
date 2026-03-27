/**
 * Archive Layout — Chronological post listing grouped by year
 */
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'
import { NavTabs } from '../components/NavTabs.js'

export default function ArchiveLayout(ctx: any) {
  const { site, posts = [], route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'archive'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  // Group posts by year descending
  const byYear = new Map<number | string, any[]>()
  for (const post of posts) {
    const year = post.date ? new Date(post.date).getFullYear() : 'Unknown'
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(post)
  }
  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a))

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <NavTabs current="/archives/" />
        <div class="main-content">
          <div class="post-list archives">
            {years.map((year) => (
              <article key={year} class="archive-group">
                <div class="archive-header">{String(year)}</div>
                {byYear.get(year)!.map((post: any) => {
                  const d = post.date ? new Date(post.date) : null
                  const dateStr = d
                    ? `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                    : ''
                  return (
                    <div key={post.slug} class="archive-list">
                      <a class="archive-item" href={post.url}>
                        <time>{dateStr}</time>
                        <span>{post.title || dateStr}</span>
                      </a>
                    </div>
                  )
                })}
              </article>
            ))}
          </div>
        </div>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
