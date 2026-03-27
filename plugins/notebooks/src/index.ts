/**
 * @titan/plugin-notebooks
 *
 * Adds notebook/notes support with hierarchical tags.
 *
 * - Registers a 'note' collection for note pages (frontmatter: notebook, tags)
 * - Builds a notebooksTree from note entries, with hierarchical tag trees
 * - Generates notebook index, per-notebook tag listing routes
 * - Provides structured tag tree for sidebar widget
 *
 * Usage:
 *   import { pluginNotebooks } from '@titan/plugin-notebooks'
 *   export default {
 *     plugins: [pluginNotebooks({ baseDir: 'notebooks' })]
 *   }
 */
import { z } from 'zod'
import type {
  PluginDefinition,
  GenerateContext,
  BaseEntry,
  Route,
} from '@titan/types'

// ── Types ──

export interface NotebooksOptions {
  /** Base URL path for notebooks (default: 'notebooks') */
  baseDir?: string
  /** Glob pattern for note sources (default: '_notebooks/**\/*.md') */
  source?: string
  /** Layout for individual notes (default: 'note') */
  layout?: string
  /** Layout for the notebooks index page (default: 'notebooks') */
  indexLayout?: string
  /** Layout for note list within a notebook (default: 'notes') */
  listLayout?: string
  /** Sort field (default: '-updated') */
  orderBy?: string
  /** Max excerpt length (default: 128) */
  autoExcerpt?: number
}

export interface NotebookDef {
  id: string
  title: string
  description?: string
  icon?: string
  sort?: number
  baseDir: string
}

export interface TagNode {
  /** Full tag path, e.g. 'programming/javascript' */
  id: string
  /** Display name (last segment), e.g. 'JavaScript' */
  name: string
  /** Full original name, e.g. 'Programming/JavaScript' */
  fullName: string
  /** Parent tag ID ('' for root children) */
  parent: string
  /** URL for this tag's note list */
  path: string
  /** Direct children tag IDs */
  children: string[]
  /** Note slugs that have this tag */
  notes: string[]
  /** Depth level (0 = root) */
  depth: number
}

export interface NotebookTree {
  id: string
  title: string
  description?: string
  icon?: string
  baseDir: string
  /** Tag tree: tagId → TagNode */
  tagTree: Map<string, TagNode>
  /** All notes in this notebook */
  notes: NoteRef[]
}

export interface NoteRef {
  slug: string
  title: string
  url: string
  date?: string
  updated?: string
  tags: string[]
  pin?: number
}

export interface NotebooksTree {
  notebooks: Record<string, NotebookTree>
  /** Display-ordered notebook IDs */
  shelf: string[]
}

// ── Zod schema for note frontmatter ──

const notePageSchema = z.object({
  notebook: z.string(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  pin: z.union([z.boolean(), z.number()]).optional(),
})

// ── Plugin ──

export function pluginNotebooks(options: NotebooksOptions = {}): PluginDefinition {
  const {
    baseDir = 'notebooks',
    source = '_notebooks/**/*.md',
    layout = 'note',
    indexLayout = 'notebooks',
    listLayout = 'notes',
    orderBy = '-updated',
    autoExcerpt = 128,
  } = options

  return {
    name: '@titan/plugin-notebooks',

    collections: [
      {
        name: 'note',
        source,
        schema: notePageSchema,
        routes: {
          item: `/${baseDir}/:slug`,
        },
        layout,
      },
    ],

    produces: ['notebooksTree'],

    hooks: {
      'generate:after': async (ctx: GenerateContext, next) => {
        await next()

        const { siteData, routes } = ctx

        // ── Collect all note entries ──
        const noteEntries = getAllEntries(siteData).filter(
          (e) => e.contentType === 'note',
        )

        // ── Build notebooks tree ──
        const notebooksTree = buildNotebooksTree(noteEntries, baseDir, orderBy)

        // Inject into siteData for layouts
        ;(siteData as any).notebooksTree = notebooksTree

        // ── Generate notebooks index route ──
        routes.push({
          path: `/${baseDir}`,
          url: `/${baseDir}/`,
          contentType: 'note',
          layout: indexLayout,
          outputPath: `${baseDir}/index.html`,
          type: 'list',
          data: { notebooksTree },
        })

        // ── Generate per-notebook tag listing routes ──
        for (const [nbId, notebook] of Object.entries(notebooksTree.notebooks)) {
          // Root tag = all notes (notebook homepage)
          routes.push({
            path: `/${baseDir}/${nbId}`,
            url: `/${baseDir}/${nbId}/`,
            contentType: 'note',
            layout: listLayout,
            outputPath: `${baseDir}/${nbId}/index.html`,
            type: 'list',
            data: {
              notebooksTree,
              notebook: nbId,
              activeTag: '',
              notes: notebook.notes,
            },
          })

          // Per-tag note list
          for (const [tagId, tagNode] of notebook.tagTree) {
            if (tagId === '') continue // skip root

            const tagSlug = tagId.replace(/\//g, '/')
            const filteredNotes = notebook.notes.filter((n) =>
              n.tags.some((t) => normalizeTag(t) === tagId || normalizeTag(t).startsWith(tagId + '/')),
            )

            routes.push({
              path: `/${baseDir}/${nbId}/tags/:tagId`,
              url: `/${baseDir}/${nbId}/tags/${tagSlug}/`,
              contentType: 'note',
              layout: listLayout,
              outputPath: `${baseDir}/${nbId}/tags/${tagSlug}/index.html`,
              type: 'list',
              data: {
                notebooksTree,
                notebook: nbId,
                activeTag: tagId,
                notes: filteredNotes,
              },
            })
          }
        }
      },
    },
  }
}

// ── Helpers ──

function buildNotebooksTree(
  entries: BaseEntry[],
  baseDir: string,
  orderBy: string,
): NotebooksTree {
  // Group entries by notebook ID
  const grouped = new Map<string, BaseEntry[]>()
  for (const entry of entries) {
    const nbId = (entry.frontmatter as any).notebook
    if (!nbId) continue
    if (!grouped.has(nbId)) grouped.set(nbId, [])
    grouped.get(nbId)!.push(entry)
  }

  const notebooks: Record<string, NotebookTree> = {}

  for (const [id, noteEntries] of grouped) {
    // Sort notes
    const sortDesc = orderBy.startsWith('-')
    const sortField = sortDesc ? orderBy.slice(1) : orderBy
    noteEntries.sort((a, b) => {
      // Pin first
      const pinA = normPin((a.frontmatter as any).pin)
      const pinB = normPin((b.frontmatter as any).pin)
      if (pinA !== pinB) return pinB - pinA

      const va = (a.frontmatter as any)[sortField] || (a as any)[sortField] || ''
      const vb = (b.frontmatter as any)[sortField] || (b as any)[sortField] || ''
      const cmp = String(va).localeCompare(String(vb))
      return sortDesc ? -cmp : cmp
    })

    const noteRefs: NoteRef[] = noteEntries.map((e) => ({
      slug: e.slug,
      title: (e.frontmatter as any).title || e.slug,
      url: e.url,
      date: (e.frontmatter as any).date,
      updated: (e.frontmatter as any).updated,
      tags: ((e.frontmatter as any).tags || []) as string[],
      pin: normPin((e.frontmatter as any).pin),
    }))

    // Build hierarchical tag tree
    const tagTree = buildTagTree(noteRefs, `${baseDir}/${id}`)

    // Extract notebook metadata from first note or frontmatter
    const fm = noteEntries[0]?.frontmatter as any

    notebooks[id] = {
      id,
      title: fm?.notebookTitle ?? id,
      description: fm?.notebookDescription,
      icon: fm?.notebookIcon,
      baseDir: `${baseDir}/${id}`,
      tagTree,
      notes: noteRefs,
    }
  }

  // Build shelf
  const shelf = Object.values(notebooks)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((n) => n.id)

  return { notebooks, shelf }
}

function buildTagTree(notes: NoteRef[], notebookBaseDir: string): Map<string, TagNode> {
  const tree = new Map<string, TagNode>()

  // Root node (all notes)
  tree.set('', {
    id: '',
    name: 'All',
    fullName: '',
    parent: '',
    path: `/${notebookBaseDir}/`,
    children: [],
    notes: notes.map((n) => n.slug),
    depth: 0,
  })

  for (const note of notes) {
    for (const rawTag of note.tags) {
      const parts = rawTag.split('/')
      let currentId = ''

      for (let i = 0; i < parts.length; i++) {
        const parentId = currentId
        currentId = parts.slice(0, i + 1).map((p) => p.toLowerCase()).join('/')
        const name = parts[i]

        if (!tree.has(currentId)) {
          tree.set(currentId, {
            id: currentId,
            name,
            fullName: parts.slice(0, i + 1).join('/'),
            parent: parentId,
            path: `/${notebookBaseDir}/tags/${currentId}/`,
            children: [],
            notes: [],
            depth: i + 1,
          })

          // Register as child of parent
          const parent = tree.get(parentId)
          if (parent && !parent.children.includes(currentId)) {
            parent.children.push(currentId)
          }
        }

        // Add note to this tag node
        const node = tree.get(currentId)!
        if (!node.notes.includes(note.slug)) {
          node.notes.push(note.slug)
        }
      }
    }
  }

  // Sort children alphabetically
  for (const node of tree.values()) {
    node.children.sort()
  }

  return tree
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, '-')
}

function normPin(val: unknown): number {
  if (val === true) return 1
  if (typeof val === 'number') return val
  return 0
}

function getAllEntries(siteData: any): BaseEntry[] {
  const entries: BaseEntry[] = []
  if (siteData.posts?.entries) entries.push(...siteData.posts.entries)
  if (siteData.pages?.entries) entries.push(...siteData.pages.entries)
  for (const [key, val] of Object.entries(siteData)) {
    if (key === 'posts' || key === 'pages' || key === 'tags' || key === 'categories') continue
    if (val && typeof val === 'object' && 'entries' in (val as any)) {
      entries.push(...(val as any).entries)
    }
  }
  return entries
}
