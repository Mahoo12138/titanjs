/**
 * TagCloud Widget — Tag Cloud Display
 *
 * Renders tags with proportional font sizes.
 */
import { z } from 'zod'

export const tagcloudWidget = {
  name: 'tagcloud',

  configSchema: z.object({
    title: z.string().default('标签云'),
    minFont: z.number().default(12),
    maxFont: z.number().default(24),
    limit: z.number().default(100),
  }),

  dataLoader: function tagcloudDataLoader(ctx: any) {
    const tags = ctx.siteData.tags
    if (!tags || tags.size === 0) return []

    const tagArray = Array.from(tags.values()) as any[]
    return tagArray.sort((a, b) => b.count - a.count)
  },

  component: function TagCloudWidget(ctx: any) {
    const { config, data } = ctx
    const tags = (data || []).slice(0, config.limit)

    if (tags.length === 0) return null

    const maxCount = Math.max(...tags.map((t: any) => t.count), 1)
    const minCount = Math.min(...tags.map((t: any) => t.count), 0)
    const range = maxCount - minCount || 1

    return (
      <widget class="widget-wrapper tagcloud">
        <div class="widget-header">
          <span class="name">{config.title}</span>
        </div>
        <div class="widget-body">
          <div class="tags">
            {tags.map((tag: any) => {
              const fontSize = config.minFont +
                ((tag.count - minCount) / range) * (config.maxFont - config.minFont)
              return (
                <a
                  key={tag.slug}
                  class="tag-item"
                  href={`/tags/${tag.slug}/`}
                  style={`font-size: ${Math.round(fontSize)}px`}
                >
                  {tag.name}
                </a>
              )
            })}
          </div>
        </div>
      </widget>
    )
  },
}
