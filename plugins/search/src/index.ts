/**
 * @titan/plugin-search
 *
 * Client-side full-text search for Titan SSG.
 *
 * 1. At **build time** (generate hook): produces a `/search-index.json`
 *    containing title, excerpt, url, and tags for every post.
 * 2. At **render time**: injects a `<Slot>` component into `head:extra`
 *    that renders a search Island.
 * 3. At **client time** (Island, `client:idle`): fetches the index JSON
 *    and provides a search-as-you-type UI.
 *
 * Usage:
 *   import { pluginSearch } from '@titan/plugin-search'
 *   export default { plugins: [pluginSearch()] }
 */
export { pluginSearch } from './plugin.js'
export type { SearchOptions, SearchIndexEntry } from './plugin.js'
