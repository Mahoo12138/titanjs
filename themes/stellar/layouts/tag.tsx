/**
 * Tag Layout — Posts filtered by a specific tag
 */
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'
import { PostCard } from '../components/PostCard.js'
import { NavTabs } from '../components/NavTabs.js'

export default function TagLayout(ctx: any) {
  const { site, posts = [], tag, route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'tag'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <NavTabs current="/tags/" />
        <div class="main-content">
          <div class="list-header">
            <h1 class="list-title"># {tag?.name || ''}</h1>
            <span class="list-count">{posts.length} 篇文章</span>
          </div>
          {posts.length > 0
            ? <div class="post-list">
                {posts.map((post: any) => <PostCard key={post.slug} post={post} />)}
              </div>
            : <p class="empty">暂无文章</p>
          }
        </div>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
