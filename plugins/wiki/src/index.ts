/**
 * @titan/plugin-wiki
 *
 * Adds wiki/documentation project support.
 *
 * - Registers a 'wiki' collection for wiki pages (frontmatter: wiki, title)
 * - Builds a wikiTree singleton from _data/wiki/*.yaml files
 * - Generates wiki index + per-project-tag index routes
 * - Provides structured project/section/page tree for sidebar widget
 *
 * Usage:
 *   import { pluginWiki } from '@titan/plugin-wiki'
 *   export default {
 *     plugins: [pluginWiki({ baseDir: 'wiki' })]
 *   }
 */
import { z } from 'zod'
import type {
  PluginDefinition,
  GenerateContext,
  BaseEntry,
} from '@titan/types'
import { setSiteData, getAllSiteEntries } from '@titan/types'

// ── Declaration Merging: register wikiTree on SiteData ──

declare module '@titan/types' {
  interface SiteDataExtensions {
    wikiTree: WikiTree
  }
}

// ── Types ──

export interface WikiOptions {
  /** Base URL path for wiki pages (default: 'wiki') */
  baseDir?: string
  /** Glob pattern for wiki page sources (default: '_wiki/**\/*.md') */
  source?: string
  /** Layout for individual wiki pages (default: 'wiki') */
  layout?: string
  /** Layout for the wiki index page (default: 'wiki-index') */
  indexLayout?: string
}

export interface WikiProject {
  id: string
  title: string
  description?: string
  icon?: string
  tags?: string[]
  sort?: number
  homepage?: string
  /** Section tree: sectionTitle → page slugs */
  tree?: Record<string, string[]>
  /** Resolved pages grouped by section */
  sections: WikiSection[]
  /** All pages in this project */
  pages: WikiPageRef[]
}

export interface WikiSection {
  title: string
  pages: WikiPageRef[]
}

export interface WikiPageRef {
  slug: string
  title: string
  url: string
}

export interface WikiTree {
  /** All projects keyed by project ID */
  projects: Record<string, WikiProject>
  /** Display-ordered project IDs (shelf) */
  shelf: string[]
  /** All project-level tags with their project IDs */
  tags: Record<string, string[]>
}

// ── Zod schema for wiki page frontmatter ──

const wikiPageSchema = z.object({
  wiki: z.string(),
  title: z.string().optional(),
  order: z.number().optional(),
})

/** Typed wiki page frontmatter (inferred from the Zod schema + extra optional fields) */
interface WikiFrontmatter {
  wiki: string
  title?: string
  order?: number
  tags?: string[]
  projectTitle?: string
  projectDescription?: string
  projectIcon?: string
  projectSort?: number
}

/** Type-safe frontmatter access for wiki entries */
function getWikiFm(entry: BaseEntry): WikiFrontmatter {
  return entry.frontmatter as unknown as WikiFrontmatter
}

// ── Plugin ──

export function pluginWiki(options: WikiOptions = {}): PluginDefinition {
  const {
    baseDir = 'wiki',
    source = '_wiki/**/*.md',
    layout = 'wiki',
    indexLayout = 'wiki-index',
  } = options

  return {
    name: '@titan/plugin-wiki',

    collections: [
      {
        name: 'wiki',
        source,
        schema: wikiPageSchema,
        routes: {
          item: `/${baseDir}/:slug`,
          list: `/${baseDir}`,
        },
        layout,
      },
    ],

    produces: ['wikiTree'],

    hooks: {
      'generate:after': async (ctx: GenerateContext, next) => {
        await next()

        const { siteData, routes } = ctx

        // ── Build wiki tree from entries + data files ──
        const wikiEntries = getAllSiteEntries(siteData).filter(
          (e) => e.contentType === 'wiki',
        )

        // Build project map from wiki config embedded in siteData
        // (loaded via _data/wiki/*.yaml → singleton, or from entry frontmatter)
        const wikiTree = buildWikiTree(wikiEntries, baseDir)

        // Inject wikiTree into siteData for layouts to access
        setSiteData(siteData, 'wikiTree', wikiTree)

        // ── Generate wiki index route ──
        routes.push({
          path: `/${baseDir}`,
          url: `/${baseDir}/`,
          contentType: 'wiki',
          layout: indexLayout,
          outputPath: `${baseDir}/index.html`,
          type: 'list',
          data: { wikiTree },
        })

        // ── Generate per-tag wiki index routes ──
        for (const [tagName, projectIds] of Object.entries(wikiTree.tags)) {
          const tagSlug = slugify(tagName)
          routes.push({
            path: `/${baseDir}/tags/:slug`,
            url: `/${baseDir}/tags/${tagSlug}/`,
            contentType: 'wiki',
            slug: tagSlug,
            layout: indexLayout,
            outputPath: `${baseDir}/tags/${tagSlug}/index.html`,
            type: 'list',
            data: { wikiTree, filterTag: tagName },
          })
        }
      },
    },
  }
}

// ── Helpers ──

function buildWikiTree(entries: BaseEntry[], baseDir: string): WikiTree {
  // Group entries by wiki project ID
  const grouped = new Map<string, BaseEntry[]>()
  for (const entry of entries) {
    const fm = getWikiFm(entry)
    const projectId = fm.wiki
    if (!projectId) continue
    if (!grouped.has(projectId)) grouped.set(projectId, [])
    grouped.get(projectId)!.push(entry)
  }

  const projects: Record<string, WikiProject> = {}
  const allTags: Record<string, string[]> = {}

  for (const [id, pages] of grouped) {
    // Sort pages: by frontmatter order, then by slug
    pages.sort((a, b) => {
      const oa = getWikiFm(a).order ?? 999
      const ob = getWikiFm(b).order ?? 999
      if (oa !== ob) return oa - ob
      return a.slug.localeCompare(b.slug)
    })

    const pageRefs: WikiPageRef[] = pages.map((p) => ({
      slug: p.slug,
      title: getWikiFm(p).title || p.slug,
      url: p.url,
    }))

    // For now, all pages in a single default section
    // In the future, _data/wiki/{id}.yaml tree config could define sections
    const sections: WikiSection[] = [{ title: '', pages: pageRefs }]

    // Extract project metadata from the first page or frontmatter
    const firstPage = pages[0]
    const fm = firstPage ? getWikiFm(firstPage) : undefined
    const projectTags = fm?.tags ?? []

    projects[id] = {
      id,
      title: fm?.projectTitle ?? id,
      description: fm?.projectDescription,
      icon: fm?.projectIcon,
      tags: projectTags,
      sort: fm?.projectSort ?? 0,
      homepage: pageRefs[0]?.url,
      sections,
      pages: pageRefs,
    }

    // Aggregate tags
    for (const tag of projectTags) {
      if (!allTags[tag]) allTags[tag] = []
      allTags[tag].push(id)
    }
  }

  // Build shelf (sorted by sort field, then title)
  const shelf = Object.values(projects)
    .sort((a, b) => (b.sort ?? 0) - (a.sort ?? 0) || a.title.localeCompare(b.title))
    .map((p) => p.id)

  return { projects, shelf, tags: allTags }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
}
