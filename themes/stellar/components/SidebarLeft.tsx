/**
 * SidebarLeft — Left Sidebar
 *
 * Renders: Logo → NavMenu → WidgetStack → Footer
 */
import { WidgetStack } from './WidgetStack.js'

function isActive(item: any, route: any) {
  if (!route || !route.url) return false
  if (item.url === '/') return route.url === '/'
  return route.url.startsWith(item.url)
}

export function SidebarLeft({ site, route, entry, widgets, widgetRegistry, logo, nav }: {
  site: any
  route: any
  entry?: any
  widgets: string[]
  widgetRegistry: any
  logo: any
  nav: any[]
}) {
  return (
    <aside class="l_left">
      <div class="leftbar-container">
        <div class="logo-wrap">
          {logo?.avatar && (
            <a class="avatar" href="/">
              <img src={logo.avatar} alt={site.title} />
            </a>
          )}
          <div class="title-wrap">
            <a class="site-title" href="/">{logo?.title || site.title}</a>
            {logo?.subtitle && <p class="site-subtitle">{logo.subtitle}</p>}
          </div>
        </div>

        {nav && nav.length > 0 && (
          <nav class="sidebar-nav">
            <ul class="nav-menu">
              {nav.map((item: any) => (
                <li key={item.title} class="nav-item">
                  <a href={item.url} class={isActive(item, route) ? 'active' : ''}>
                    {item.icon && <span class="icon">{item.icon}</span>}
                    <span class="title">{item.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <WidgetStack widgets={widgets} site={site} route={route} entry={entry} widgetRegistry={widgetRegistry} />

        <div class="sidebar-footer">
          <span class="powered">
            Powered by <a href="https://github.com/user/titanjs" target="_blank">TitanJS</a>
          </span>
        </div>
      </div>
    </aside>
  )
}
