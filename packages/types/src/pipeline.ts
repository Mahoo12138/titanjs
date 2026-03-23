/**
 * Pipeline types - Four-stage onion middleware model
 */

/** Generic middleware function: onion model with next() */
export type Middleware<Ctx> = (ctx: Ctx, next: () => Promise<void>) => Promise<void>

/** Pipeline interface: composable middleware stack */
export interface Pipeline<Ctx> {
  use(middleware: Middleware<Ctx>): this
  run(ctx: Ctx): Promise<void>
}

// ── Load Stage ──

export interface LoadContext {
  /** Absolute path to the source file */
  filePath: string
  /** Raw file content (before parsing) */
  rawContent: string
  /** Parsed frontmatter data */
  frontmatter: Record<string, unknown>
  /** Content type name: 'post' | 'page' | custom */
  contentType: string
  /** Markdown body (without frontmatter) */
  body: string
}

// ── Transform Stage ──

export interface TransformContext {
  /** The entry being transformed */
  entry: BaseEntry
  /** Rendered HTML (intermediate product) */
  html: string
  /** Collected asset references to pass to Vite */
  assets: AssetRef[]
}

// ── Generate Stage ──

export interface GenerateContext {
  /** Aggregated site data (all collections + singletons) */
  siteData: SiteData
  /** Route list to be generated */
  routes: Route[]
}

// ── Emit Stage ──

export interface EmitContext {
  /** The route being emitted */
  route: Route
  /** Full site data */
  siteData: SiteData
  /** Output file path */
  outputPath: string
  /** Rendered HTML string */
  html: string
}

// ── Re-export content types used in contexts ──
import type { BaseEntry, AssetRef, SiteData } from './content.js'
import type { Route } from './route.js'
export type { BaseEntry, AssetRef, SiteData, Route }
