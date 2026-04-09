/**
 * Route types
 */
import type { Tag, Category } from './content.js'

export interface Route {
  /** Route path pattern, e.g. '/posts/:slug' */
  path: string
  /** Resolved URL for this route instance */
  url: string
  /** Content type this route renders */
  contentType: string
  /** Entry slug (for item routes) */
  slug?: string
  /** Layout name to use */
  layout: string
  /** Output file path relative to outDir */
  outputPath: string
  /** Route type */
  type: 'item' | 'list' | 'paginated' | 'custom'
  /** Pagination info (for paginated routes) */
  pagination?: Pagination
  /** Additional route data */
  data?: RouteData
}

/**
 * Route data can be any of the typed variants or arbitrary plugin data.
 * Use the helper functions to access typed fields safely.
 */
export type RouteData = Record<string, unknown>

/**
 * Get a typed Tag from route data.
 */
export function getRouteTag(route: Route): Tag | undefined {
  return route.data?.tag as Tag | undefined
}

/**
 * Get a typed Category from route data.
 */
export function getRouteCategory(route: Route): Category | undefined {
  return route.data?.category as Category | undefined
}

export interface Pagination {
  /** Current page number (1-based) */
  current: number
  /** Total number of pages */
  total: number
  /** Items per page */
  size: number
  /** Previous page URL (null if first) */
  prev: string | null
  /** Next page URL (null if last) */
  next: string | null
}
