/**
 * Author Widget — Author Card
 *
 * Shows the post author's avatar, name, bio, and link to all posts.
 */

export const authorWidget = {
  name: 'author',

  configSchema: {
    parse: (v: any) => ({
      showAvatar: v?.showAvatar ?? true,
      name: v?.name ?? '',
      avatar: v?.avatar ?? '',
      bio: v?.bio ?? '',
      url: v?.url ?? '/about/',
    }),
    safeParse: (v: any) => {
      try {
        return { success: true, data: authorWidget.configSchema.parse(v) }
      } catch (e) {
        return { success: false, error: { issues: [{ message: String(e) }] } }
      }
    },
  },

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
