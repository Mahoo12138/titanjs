import { pluginSitemap } from '@titan/plugin-sitemap'
import { pluginRSS } from '@titan/plugin-rss'
import { pluginReadingTime } from '@titan/plugin-reading-time'
import { pluginToc } from '@titan/plugin-toc'
import { pluginTagPlugins } from '@titan/plugin-tag-plugins'
import { pluginComments } from '@titan/plugin-comments'
import { pluginSearch } from '@titan/plugin-search'
import { pluginWiki } from '@titan/plugin-wiki'
import { pluginNotebooks } from '@titan/plugin-notebooks'

/** @type {import('@titan/core').UserConfig} */
export default {
  title: 'Titan Example',
  url: 'https://example.com',
  language: 'zh-CN',
  source: 'source',
  // Short name → resolves to themes/stellar/ locally,
  // or titan-theme-stellar / @titan/theme-stellar from npm
  theme: 'stellar',
  build: {
    outDir: 'public',
    cacheDir: '.titan-cache',
    concurrency: 8,
  },
  markdown: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
  styles: {
    tokens: {},
  },
  plugins: [
    pluginTagPlugins(),
    pluginWiki(),
    pluginNotebooks(),
    pluginSitemap({ changefreq: 'weekly' }),
    pluginRSS({ title: 'Titan Example', description: 'An example Titan blog' }),
    pluginReadingTime({ wordsPerMinute: 200 }),
    pluginToc({ maxDepth: 3 }),
    pluginComments({
      provider: 'giscus',
      giscus: {
        repo: 'user/repo',
        repoId: 'R_example',
        category: 'Announcements',
        categoryId: 'DIC_example',
      },
    }),
    pluginSearch(),
  ],
}
