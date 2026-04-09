/**
 * Stellar Theme Configuration for TitanJS
 *
 * Ported from hexo-theme-stellar v1.33
 * Maps Stellar's _config.yml → Titan theme definition
 */
import { defineTheme } from '@titan/types'
import { tocWidget } from './widgets/toc.js'
import { recentWidget } from './widgets/recent.js'
import { authorWidget } from './widgets/author.js'
import { tagcloudWidget } from './widgets/tagcloud.js'
import { relatedWidget } from './widgets/related.js'
import { treeWidget } from './widgets/tree.js'
import { tagtreeWidget } from './widgets/tagtree.js'

export default defineTheme({
  name: 'titan-stellar',
  version: '0.1.0',

  // ── Content type → layout mapping ──
  typeLayoutMap: {
    post: 'post',
    page: 'page',
    tag: 'tag',
    category: 'category',
    archive: 'archive',
    wiki: 'wiki',
    note: 'note',
  },

  // ── Slot declarations ──
  slots: {
    'head:extra': {
      description: 'Extra tags injected into <head>',
      mode: 'stack',
    },
    'post:before-content': {
      description: 'Before the post body content',
      mode: 'stack',
    },
    'post:after-content': {
      description: 'After the post body content (comments, etc.)',
      mode: 'stack',
    },
    'footer:extra': {
      description: 'Extra footer content',
      mode: 'stack',
    },
  },

  // ── Widget definitions ──
  widgets: [
    tocWidget,
    recentWidget,
    authorWidget,
    tagcloudWidget,
    relatedWidget,
    treeWidget,
    tagtreeWidget,
  ],

  // ── SiteTree: per-layout sidebar configuration ──
  // Maps layout types to their left/right sidebar widget lists
  // Mirrors Stellar's site_tree config
  siteTree: {
    home: {
      leftbar: ['author', 'recent'],
      rightbar: null,
    },
    post: {
      leftbar: ['related', 'recent'],
      rightbar: ['toc'],
    },
    page: {
      leftbar: ['recent'],
      rightbar: ['toc'],
    },
    archive: {
      leftbar: ['recent'],
      rightbar: null,
    },
    tag: {
      leftbar: ['tagcloud', 'recent'],
      rightbar: null,
    },
    category: {
      leftbar: ['recent'],
      rightbar: null,
    },
    'wiki-index': {
      leftbar: ['recent'],
      rightbar: null,
    },
    wiki: {
      leftbar: ['tree', 'recent'],
      rightbar: ['toc'],
    },
    notebooks: {
      leftbar: ['recent'],
      rightbar: null,
    },
    notes: {
      leftbar: ['tagtree', 'recent'],
      rightbar: null,
    },
    note: {
      leftbar: ['tagtree', 'recent'],
      rightbar: ['toc'],
    },
  },

  // ── Default widget instance configs ──
  widgetsConfig: {
    toc: {
      listNumber: false,
      minDepth: 2,
      maxDepth: 4,
      collapse: false,
    },
    recent: {
      limit: 10,
    },
    author: {
      showAvatar: true,
    },
    tagcloud: {
      title: '标签云',
      minFont: 12,
      maxFont: 24,
      limit: 100,
    },
    related: {
      title: '相关文章',
      limit: 5,
    },
    tree: {
      title: '文档目录',
    },
    tagtree: {
      title: '笔记分类',
    },
  },
})
