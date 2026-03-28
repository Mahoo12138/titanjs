/**
 * WidgetStack — Renders a list of widgets from sidebar config
 */
import { h } from 'preact'

export function WidgetStack({ widgets, site, route, entry, widgetRegistry }: {
  widgets: string[]
  site: any
  route: any
  entry?: any
  widgetRegistry: any
}) {
  if (!widgets || widgets.length === 0) return null

  const rendered = widgets.map((widgetName) => {
    if (!widgetRegistry || !widgetRegistry.has(widgetName)) return null
    const def = widgetRegistry.get(widgetName)
    if (!def) return null

    const ctx = widgetRegistry.buildWidgetContext(widgetName, site, route, entry)
    if (!ctx) return null

    try {
      return (
        <div key={widgetName} class={`widget-slot widget-${widgetName}`}>
          {h(def.component, ctx)}
        </div>
      )
    } catch (err) {
      console.warn(`[widget] Failed to render "${widgetName}":`, err)
      return null
    }
  }).filter(Boolean)

  if (rendered.length === 0) return null

  return <div class="widget-stack">{rendered}</div>
}
