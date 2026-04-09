/**
 * @titan/plugin-github-card
 *
 * Sidebar widget plugin that displays a GitHub profile card.
 * Uses the Block system to register as a sidebar widget — add
 * `'github-card'` to your theme's siteTree sidebar to display it.
 *
 * Usage:
 *
 *   import { pluginGithubCard } from '@titan/plugin-github-card'
 *
 *   export default defineConfig({
 *     plugins: [
 *       pluginGithubCard({ username: 'octocat' }),
 *     ],
 *   })
 *
 * Then in your theme's siteTree (or widgetsConfig):
 *
 *   siteTree: {
 *     home: { leftbar: ['author', 'github-card', 'recent'] },
 *     post: { leftbar: ['github-card', 'recent'] },
 *   }
 */
export { pluginGithubCard } from './plugin.js'
export type { GithubCardOptions, GithubCardConfig } from './plugin.js'
