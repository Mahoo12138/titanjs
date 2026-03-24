/**
 * Singleton definition types
 *
 * A Singleton is globally unique data with three possible sources:
 * - Markdown file (with frontmatter)
 * - JSON file
 * - Async function (fetched at build time)
 */
import type { z } from 'zod'

export interface SingletonDefinition<T = unknown> {
  /** Unique singleton name */
  name: string
  /** Data source: file path or async function */
  source: string | (() => Promise<T>)
  /** Zod schema for validation */
  schema: z.ZodType<T>
  /** Cache strategy for async sources */
  cache?: 'build' | 'persistent'
  /** Cache TTL in milliseconds (only for 'persistent') */
  cacheTTL?: number
  /** Fallback value when async source fails */
  fallback?: T
}

/**
 * Define a singleton with type inference
 */
export function defineSingleton<T>(
  def: SingletonDefinition<T>,
): SingletonDefinition<T> {
  return def
}
