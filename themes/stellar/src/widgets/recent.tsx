/**
 * Recent Widget — Latest Posts List
 *
 * Shows the most recently updated posts.
 */
import { z } from 'zod'

export const recentWidget = {
  name: 'recent',

  configSchema: z.object({
    limit: z.number().default(10),
    rss: z.string().default('/atom.xml'),
  }),

  dataLoader: function recentDataLoader(ctx: any) {
    const posts = ctx.siteData.posts?.entries ?? []
    return posts
      .filter((p: any) => p.title && p.title.length > 0)
      .sort((a: any, b: any) => {
        const da = a.updated || a.date
        const db = b.updated || b.date
        if (!da || !db) return 0
        return new Date(db).getTime() - new Date(da).getTime()
      })
  },

  component: function RecentWidget(ctx: any) {
    const { config, data } = ctx
    const posts = (data || []).slice(0, config.limit)

    if (posts.length === 0) return null

    return (
      <widget class="widget-wrapper recent">
        <div class="widget-header">
          <span class="name">最近更新</span>
          {config.rss && (
            <a class="cap-action" href={config.rss} title="RSS">⊙</a>
          )}
        </div>
        <div class="widget-body">
          <div class="post-list">
            {posts.map((post: any) => (
              <a key={post.slug} class="post-item" href={post.url}>
                <span class="post-title">{post.title}</span>
              </a>
            ))}
          </div>
        </div>
      </widget>
    )
  },
}
