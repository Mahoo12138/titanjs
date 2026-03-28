/**
 * Default Layout — Master layout for index/listing pages
 *
 * Three-column structure matching Stellar:
 *   l_left (sidebar) | l_main (content) | l_right (optional sidebar)
 */
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'
import { PostCard } from '../components/PostCard.js'
import { Paginator } from '../components/Paginator.js'
import { NavTabs } from '../components/NavTabs.js'

export default function DefaultLayout(ctx: any) {
  const { site, posts = [], pagination, route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'home'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <NavTabs current="/" />
        <div class="main-content">
          {posts.length > 0
            ? <div class="post-list">
                {posts.map((post: any) => <PostCard key={post.slug} post={post} />)}
              </div>
            : <p class="empty">暂无文章</p>
          }
          {pagination && <Paginator pagination={pagination} />}
        </div>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
