/**
 * SidebarRight — Right Sidebar
 *
 * Renders: WidgetStack (typically TOC, etc.)
 */
import { WidgetStack } from './WidgetStack.js'

export function SidebarRight({ site, route, entry, widgets, widgetRegistry }: {
  site: any
  route: any
  entry?: any
  widgets: string[]
  widgetRegistry: any
}) {
  if (!widgets || widgets.length === 0) return null

  return (
    <aside class="l_right">
      <WidgetStack widgets={widgets} site={site} route={route} entry={entry} widgetRegistry={widgetRegistry} />
    </aside>
  )
}
