/**
 * Related Widget — Related Posts
 *
 * Shows posts related to the current post by shared tags.
 */

export const relatedWidget = {
  name: 'related',

  configSchema: {
    parse: (v: any) => ({
      title: v?.title ?? '相关文章',
      limit: v?.limit ?? 5,
    }),
    safeParse: (v: any) => {
      try {
        return { success: true, data: relatedWidget.configSchema.parse(v) }
      } catch (e) {
        return { success: false, error: { issues: [{ message: String(e) }] } }
      }
    },
  },

  dataLoader: function relatedDataLoader(ctx: any) {
    const entry = ctx.entry
    if (!entry || !entry.tags) return []

    const allPosts = ctx.siteData.posts?.entries ?? []
    const currentTags = new Set(entry.tags.map((t: any) => t.slug))

    if (currentTags.size === 0) return []

    const scored = allPosts
      .filter((p: any) => p.slug !== entry.slug)
      .map((p: any) => {
        const postTags = (p.tags || []).map((t: any) => t.slug)
        const shared = postTags.filter((s: any) => currentTags.has(s)).length
        return { post: p, score: shared }
      })
      .filter((s: any) => s.score > 0)
      .sort((a: any, b: any) => b.score - a.score)

    return scored.map((s: any) => s.post)
  },

  component: function RelatedWidget(ctx: any) {
    const { config, data } = ctx
    const posts = (data || []).slice(0, config.limit)

    if (posts.length === 0) return null

    return (
      <widget class="widget-wrapper related">
        <div class="widget-header">
          <span class="name">{config.title}</span>
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
