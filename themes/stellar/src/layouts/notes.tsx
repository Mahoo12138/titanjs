/**
 * Notes Layout — Note list within a notebook (optionally filtered by tag)
 */
import { SidebarLeft } from '../components/SidebarLeft.js'
import { SidebarRight } from '../components/SidebarRight.js'

export default function NotesLayout(ctx: any) {
  const { site, route, theme, notebooksTree, notebook: nbId, activeTag, notes = [] } = ctx

  const widgetRegistry = theme?.__widgetRegistry
  const layoutType = 'notes'

  const leftWidgets = widgetRegistry?.resolveSidebar('leftbar', layoutType) ?? []
  const rightWidgets = widgetRegistry?.resolveSidebar('rightbar', layoutType) ?? []

  const logo = theme?.logo ?? {}
  const nav = theme?.nav ?? []

  const nb = notebooksTree?.notebooks?.[nbId]
  const title = nb?.title || nbId || 'Notes'

  return (
    <div class="l_body index">
      <SidebarLeft
        site={site}
        route={route}
        entry={{ frontmatter: { notebook: nbId }, slug: '' }}
        widgets={leftWidgets}
        widgetRegistry={widgetRegistry}
        logo={logo}
        nav={nav}
      />

      <div class="l_main" id="main">
        <div class="main-content">
          <div class="list-header">
            <h1 class="list-title">{title}</h1>
            {activeTag
              ? <span class="list-count">标签: {activeTag} · {notes.length} 篇</span>
              : <span class="list-count">{notes.length} 篇笔记</span>
            }
          </div>

          {notes.length > 0
            ? <div class="note-list">
                {notes.map((note: any) => (
                  <a key={note.slug} class={`note-card${note.pin ? ' pinned' : ''}`} href={note.url}>
                    {note.pin && <span class="pin-badge">📌</span>}
                    <div class="note-card-body">
                      <div class="note-card-title">{note.title}</div>
                      <div class="note-card-meta">
                        {(note.updated || note.date) && (
                          <time>{String(note.updated || note.date).split('T')[0]}</time>
                        )}
                      </div>
                      {note.tags && note.tags.length > 0 && (
                        <div class="note-card-tags">
                          {note.tags.map((t: string) => (
                            <span key={t} class="tag">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            : <p class="empty">暂无笔记</p>
          }
        </div>
      </div>

      {rightWidgets.length > 0 && (
        <SidebarRight site={site} route={route} widgets={rightWidgets} widgetRegistry={widgetRegistry} />
      )}
    </div>
  )
}
