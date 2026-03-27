/**
 * @titan/plugin-comments
 *
 * Comment system plugin for Titan SSG.
 * Supports Giscus, Waline, and Twikoo — all rendered as Islands
 * that activate on `client:visible` for lazy loading.
 *
 * The plugin injects a slot component into `post:after-content`.
 *
 * Usage:
 *
 *   import { pluginComments } from '@titan/plugin-comments'
 *
 *   // Giscus
 *   pluginComments({
 *     provider: 'giscus',
 *     giscus: {
 *       repo: 'user/repo',
 *       repoId: 'R_xxx',
 *       category: 'Announcements',
 *       categoryId: 'DIC_xxx',
 *     },
 *   })
 *
 *   // Waline
 *   pluginComments({
 *     provider: 'waline',
 *     waline: { serverURL: 'https://waline.example.com' },
 *   })
 *
 *   // Twikoo
 *   pluginComments({
 *     provider: 'twikoo',
 *     twikoo: { envId: 'https://twikoo.example.com' },
 *   })
 */
export { pluginComments } from './plugin.js'
export type {
  CommentsOptions,
  GiscusConfig,
  WalineConfig,
  TwikooConfig,
} from './plugin.js'
