/**
 * Post Layout — Single blog post page
 *
 * Three-column structure with article content in center.
 */
import { Slot } from '@titan/core'
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'

export default function PostLayout(ctx: any) {
  const { site, post, route, theme } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'post'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []
  const articleConfig = theme?.article ?? {}

  const dateStr = post.date ? new Date(post.date).toISOString().split('T')[0] : ''
  const updatedStr =
    post.updated && post.updated !== post.date
      ? new Date(post.updated).toISOString().split('T')[0]
      : null

  return (
    <div class="l_body content">
      <SidebarLeft site={site} route={route} entry={post} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <article class={`md-text content ${articleConfig.type || 'tech'}`}>
          <div class="article-header">
            <h1 class="article-title">{post.title}</h1>
            <div class="article-meta">
              {dateStr && <time class="article-date">📅 {dateStr}</time>}
              {updatedStr && <span class="article-updated"> (更新于 {updatedStr})</span>}
              {post.readingTime && (
                <span class="reading-time"> · ☕ {post.readingTime} min</span>
              )}
            </div>
            {post.tags && post.tags.length > 0 && (
              <div class="article-tags">
                {post.tags.map((tag: any) => (
                  <a key={tag.slug} class="tag" href={`/tags/${tag.slug}/`}>#{tag.name}</a>
                ))}
              </div>
            )}
          </div>

          <Slot name="post:before-content" props={{ post, site }} />

          <div class="titan-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

          <Slot name="post:after-content" props={{ post, site }} />

          <div class="article-footer">
            {articleConfig.license && (
              <div class="license">
                <span>📜 {articleConfig.license}</span>
              </div>
            )}
          </div>

          {(post.prev || post.next) && (
            <nav class="read-next">
              {post.prev
                ? <a class="prev-post" href={post.prev.url}>
                    <span class="label">← 上一篇</span>
                    <span class="title">{post.prev.title}</span>
                  </a>
                : <span class="prev-post empty" />
              }
              {post.next
                ? <a class="next-post" href={post.next.url}>
                    <span class="label">下一篇 →</span>
                    <span class="title">{post.next.title}</span>
                  </a>
                : <span class="next-post empty" />
              }
            </nav>
          )}
        </article>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} entry={post} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
