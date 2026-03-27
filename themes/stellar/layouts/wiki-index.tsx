/**
 * Wiki Index Layout — Grid of wiki project cards
 */
import { SidebarLeft } from '../components/SidebarLeft.js'

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function WikiIndexLayout(ctx: any) {
  const { site, route, theme, wikiTree, filterTag } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'index_wiki'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  if (!wikiTree) {
    return (
      <div class="l_body index">
        <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />
        <div class="l_main" id="main">
          <p class="empty">暂无 Wiki 项目</p>
        </div>
      </div>
    )
  }

  const { projects, shelf, tags } = wikiTree
  const displayIds: string[] = filterTag ? (tags[filterTag] || []) : shelf
  const allTagNames = Object.keys(tags).sort()

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        {allTagNames.length > 0 && (
          <nav class="wiki-tabs">
            <div class="wiki-tabs-inner">
              <a class={`wiki-tab${!filterTag ? ' active' : ''}`} href="/wiki/">全部</a>
              {allTagNames.map((tag: string) => (
                <a
                  key={tag}
                  class={`wiki-tab${filterTag === tag ? ' active' : ''}`}
                  href={`/wiki/tags/${slugify(tag)}/`}
                >
                  {tag}
                </a>
              ))}
            </div>
          </nav>
        )}

        <div class="wiki-grid">
          {displayIds.map((id: string) => {
            const project = projects[id]
            if (!project) return null
            return (
              <a key={id} class="wiki-card" href={project.homepage || `/wiki/${id}/`}>
                {project.icon
                  ? <img class="wiki-card-icon" src={project.icon} alt="" />
                  : <div class="wiki-card-icon placeholder">📖</div>
                }
                <div class="wiki-card-body">
                  <div class="wiki-card-title">{project.title}</div>
                  {project.description && (
                    <div class="wiki-card-desc">{project.description}</div>
                  )}
                  {project.tags && project.tags.length > 0 && (
                    <div class="wiki-card-tags">
                      {project.tags.map((t: string) => (
                        <span key={t} class="wiki-tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
