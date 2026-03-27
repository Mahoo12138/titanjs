/**
 * @titan/plugin-tag-plugins
 *
 * Provides Stellar-style tag plugins via remark-directive syntax.
 *
 * Container directives (:::name{attrs}\n...\n:::):
 *   - note, box        — callout / admonition blocks
 *   - tabs              — tabbed content panels
 *   - timeline          — timeline with nodes
 *   - folding           — collapsible details/summary
 *   - grid              — CSS grid layout with cells
 *   - blockquote        — styled blockquote wrapper
 *   - gallery           — image gallery grid
 *
 * Leaf directives (::name{attrs}):
 *   - link              — rich link card
 *   - button            — styled button
 *   - image             — enhanced image with caption
 *   - copy              — copyable text
 *
 * Inline directives (:name[text]{attrs}):
 *   - mark, hashtag     — highlighted / tagged text
 *   - kbd, sup, sub     — semantic inline elements
 *   - icon, emoji       — icon / emoji inline
 *   - badge             — colored badge
 *
 * Usage in Markdown:
 *
 *   :::note{color=yellow title="提示"}
 *   This is an important note.
 *   :::
 *
 *   :::tabs
 *   ::tab{title="Tab 1"}
 *   Content for tab 1
 *   ::tab{title="Tab 2"}
 *   Content for tab 2
 *   :::
 *
 *   :mark[highlighted text]{color=red}
 *
 * Plugin registration:
 *
 *   import { pluginTagPlugins } from '@titan/plugin-tag-plugins'
 *   export default { plugins: [pluginTagPlugins()] }
 */
export { pluginTagPlugins } from './plugin.js'
export { remarkStellarDirectives } from './remark-stellar.js'
export type { TagPluginsOptions } from './plugin.js'
export type { StellarDirectivesOptions } from './remark-stellar.js'
