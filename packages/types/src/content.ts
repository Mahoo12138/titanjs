/**
 * Content data model types
 */

// ── Plugin Data Extensions ──

/**
 * Plugins extend this interface via TypeScript Declaration Merging
 * to register their entry data fields with type safety.
 *
 * Example (in a plugin):
 *   declare module '@titan/types' {
 *     interface EntryExtensions {
 *       toc: TocItem[]
 *       readingTime: number
 *     }
 *   }
 *
 * Then plugins can use `setEntryData(ctx.entry, 'toc', tree)` instead of `(ctx.entry as any).toc = tree`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EntryExtensions {}

/**
 * Set a plugin-provided data field on an entry (type-safe).
 */
export function setEntryData<K extends keyof EntryExtensions>(
  entry: BaseEntry,
  key: K,
  value: EntryExtensions[K],
): void {
  ;(entry as any)[key] = value
}

/**
 * Get a plugin-provided data field from an entry (type-safe).
 */
export function getEntryData<K extends keyof EntryExtensions>(
  entry: BaseEntry,
  key: K,
): EntryExtensions[K] | undefined {
  return (entry as any)[key]
}

// ── Base Entry ──

export interface BaseEntry {
  /** Unique identifier */
  id: string
  /** URL-friendly slug */
  slug: string
  /** Content type name */
  contentType: string
  /** Locale code (reserved for I18n) */
  locale: string
  /** Alternate language versions (reserved for I18n) */
  alternates: AlternateLink[]
  /** Raw frontmatter data */
  frontmatter: Record<string, unknown>
  /** Raw Markdown content */
  content: string
  /** Rendered HTML */
  html: string
  /** Output file path */
  path: string
  /** Final access URL */
  url: string
  /** Resolved assets after Vite processing */
  assets: ResolvedAsset[]
  /** Absolute path to the source file (for file→entry mapping) */
  sourceFilePath?: string
}

// ── Built-in Post ──

export interface Post extends BaseEntry {
  contentType: 'post'
  title: string
  date: Date
  updated: Date
  tags: Tag[]
  categories: Category[]
  excerpt: string
  headings: Heading[]
  readingTime: number
  prev: Post | null
  next: Post | null
}

// ── Built-in Page ──

export interface Page extends BaseEntry {
  contentType: 'page'
  title: string
}

// ── Asset types ──

export interface AssetRef {
  /** Original path in Markdown (relative) */
  originalPath: string
  /** Absolute path in file system */
  absolutePath: string
}

export interface ResolvedAsset extends AssetRef {
  /** Final URL with hash after Vite processing */
  finalUrl: string
}

// ── Heading / TOC ──

export interface Heading {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  slug: string
  children: Heading[]
}

// ── Tag / Category ──

export interface Tag {
  name: string
  slug: string
  count: number
}

export interface Category {
  name: string
  slug: string
  count: number
  children: Category[]
}

// ── I18n ──

export interface AlternateLink {
  locale: string
  url: string
}

// ── Collection ──

export interface Collection<T extends BaseEntry = BaseEntry> {
  name: string
  entries: T[]
  find(filter?: Partial<T>): T[]
  findOne(slug: string): T | undefined
  sort(key: keyof T, order?: 'asc' | 'desc'): T[]
  count(): number
}

// ── SiteData Extensions (Declaration Merging) ──

/**
 * Plugins extend this interface via TypeScript Declaration Merging
 * to register their SiteData fields with type safety.
 *
 * Example (in a plugin):
 *   declare module '@titan/types' {
 *     interface SiteDataExtensions {
 *       wikiTree: WikiTree
 *       notebooksTree: NotebooksTree
 *     }
 *   }
 *
 * Then plugins can use `setSiteData(siteData, 'wikiTree', tree)` instead of `(siteData as any).wikiTree = tree`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SiteDataExtensions {}

/**
 * Set a plugin-provided data field on SiteData (type-safe).
 */
export function setSiteData<K extends keyof SiteDataExtensions>(
  siteData: SiteData,
  key: K,
  value: SiteDataExtensions[K],
): void {
  ;(siteData as any)[key] = value
}

/**
 * Get a plugin-provided data field from SiteData (type-safe).
 */
export function getSiteData<K extends keyof SiteDataExtensions>(
  siteData: SiteData,
  key: K,
): SiteDataExtensions[K] | undefined {
  return (siteData as any)[key]
}

/**
 * Get a custom collection from SiteData by content type name (type-safe).
 * Returns undefined if the collection doesn't exist.
 */
export function getSiteCollection(
  siteData: SiteData,
  contentType: string,
): Collection<BaseEntry> | undefined {
  const val = siteData[contentType]
  if (val && typeof val === 'object' && 'findOne' in val) {
    return val as Collection<BaseEntry>
  }
  return undefined
}

/**
 * Collect all entries from all collections in SiteData.
 * Includes posts, pages, and any custom collections.
 */
export function getAllSiteEntries(siteData: SiteData): BaseEntry[] {
  const entries: BaseEntry[] = []
  if (siteData.posts?.entries) entries.push(...siteData.posts.entries)
  if (siteData.pages?.entries) entries.push(...siteData.pages.entries)
  // Also check custom collections
  for (const [key, val] of Object.entries(siteData)) {
    if (key === 'posts' || key === 'pages' || key === 'tags' || key === 'categories') continue
    if (val && typeof val === 'object' && 'entries' in (val as object)) {
      entries.push(...(val as Collection<BaseEntry>).entries)
    }
  }
  return entries
}

// ── SiteData ──

export interface SiteData extends SiteDataExtensions {
  posts: Collection<Post>
  pages: Collection<Page>
  tags: Map<string, Tag>
  categories: Map<string, Category>
  /** Index signature for dynamic collections and plugin extensions */
  [key: string]: unknown
}
