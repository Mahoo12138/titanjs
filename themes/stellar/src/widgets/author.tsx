/**
 * Author Widget — Author Card
 *
 * Shows the post author's avatar, name, bio, and link to all posts.
 */
import { z } from 'zod'

export const authorWidget = {
  name: 'author',

  configSchema: z.object({
    showAvatar: z.boolean().default(true),
    name: z.string().default(''),
    avatar: z.string().default(''),
    bio: z.string().default(''),
    url: z.string().default('/about/'),
  }),

  component: function AuthorWidget(ctx: any) {
    const { config, site } = ctx

    const name = config.name || site?.title
    const avatar = config.avatar
    const bio = config.bio

    return (
      <widget class="widget-wrapper user-card author">
        <div class="widget-body">
          {config.showAvatar && avatar && (
            <div class="avatar">
              <img src={avatar} alt={name} />
            </div>
          )}
          <p class="username">{name}</p>
          {bio && <p class="bio">{bio}</p>}
          <a class="follow" href={config.url}>📄 全部文章</a>
        </div>
      </widget>
    )
  },
}
