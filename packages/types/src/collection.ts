/**
 * Collection definition types
 *
 * A Collection is a content type with multiple entries,
 * each sourced from a Markdown file.
 */
import type { z } from 'zod'
import type { BaseEntry } from './content.js'

export interface CollectionDefinition<T extends BaseEntry = BaseEntry> {
  /** Unique collection name (e.g. 'notes', 'recipes') */
  name: string
  /** Glob pattern(s) for source files */
  source: string | string[]
  /** Zod schema for frontmatter validation */
  schema: z.ZodType<Omit<T, keyof BaseEntry>>
  /** Route configuration */
  routes: CollectionRoutes
  /** Layout name for rendering */
  layout: string
  /** I18n locale extraction strategy */
  locale?: LocaleStrategy
}

export interface CollectionRoutes {
  /** Item route pattern, e.g. '/notes/:slug' */
  item: string
  /** List route pattern, e.g. '/notes' */
  list?: string
  /** Pagination config */
  paginate?: {
    size: number
    path: string   // e.g. '/notes/page/:n'
  }
}

export interface LocaleStrategy {
  /** How to determine locale */
  strategy: 'filename-suffix' | 'directory'
  /** Default locale code */
  default: string
  /** Whether to fallback to default locale */
  fallback: boolean
}

/**
 * Define a collection with type inference
 */
export function defineCollection<T extends BaseEntry = BaseEntry>(
  def: CollectionDefinition<T>,
): CollectionDefinition<T> {
  return def
}
