/**
 * Notebooks Index Layout — Grid of notebook cards
 */
import { SidebarLeft } from '../components/SidebarLeft.js'

export default function NotebooksLayout(ctx: any) {
  const { site, route, theme, notebooksTree } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'notebooks'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  if (!notebooksTree) {
    return (
      <div class="l_body index">
        <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />
        <div class="l_main" id="main">
          <p class="empty">暂无笔记本</p>
        </div>
      </div>
    )
  }

  const { notebooks, shelf } = notebooksTree

  return (
    <div class="l_body index">
      <SidebarLeft site={site} route={route} widgets={leftWidgets} widgetRegistry={widgetRegistry} logo={logo} nav={nav} />

      <div class="l_main" id="main">
        <div class="main-content">
          <div class="list-header">
            <h1 class="list-title">📓 笔记本</h1>
          </div>
          <div class="notebook-grid">
            {shelf.map((id: string) => {
              const nb = notebooks[id]
              if (!nb) return null
              return (
                <a key={id} class="notebook-card" href={`/${nb.baseDir}/`}>
                  {nb.icon
                    ? <img class="notebook-card-icon" src={nb.icon} alt="" />
                    : <div class="notebook-card-icon placeholder">📓</div>
                  }
                  <div class="notebook-card-body">
                    <div class="notebook-card-title">{nb.title}</div>
                    {nb.description && (
                      <div class="notebook-card-desc">{nb.description}</div>
                    )}
                    <div class="notebook-card-count">{nb.notes.length} 篇笔记</div>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
