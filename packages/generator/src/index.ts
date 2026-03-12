/**
 * @neo-hexo/generator
 *
 * Built-in route generators for Neo-Hexo.
 * Generates routes for posts, pages, and static assets.
 *
 * Usage:
 * ```ts
 * import generators from '@neo-hexo/generator';
 *
 * export default defineConfig({
 *   plugins: [generators()],
 * });
 * ```
 */

import type {
  NeoHexoPlugin,
  SiteLocals,
  Route,
  PostData,
} from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeneratorOptions {
  /** Permalink pattern (default: ':year/:month/:day/:title/'). */
  permalink?: string;
  /** Whether to generate index pages per archive/tag/category (default: true). */
  indexPages?: boolean;
}

// ─── Post Route Generator ────────────────────────────────────────────────────

/**
 * Generate routes for all published posts.
 * Each post gets a route with prev/next navigation data.
 */
export function generatePostRoutes(posts: PostData[], permalink: string): Route[] {
  const published = posts.filter((p) => p.published);
  // Sort by date descending (newest first)
  published.sort((a, b) => {
    const dateA = String(a.frontMatter['date'] ?? '');
    const dateB = String(b.frontMatter['date'] ?? '');
    return dateB.localeCompare(dateA);
  });

  return published.map((post, idx) => {
    const slug = String(post.frontMatter['slug'] ?? '');
    const date = String(post.frontMatter['date'] ?? '');
    const path = buildPermalink(permalink, { slug, date, title: slug });

    return {
      path,
      layout: ['post', 'page', 'index'],
      data: {
        ...post,
        prev: idx > 0 ? published[idx - 1] : null,
        next: idx < published.length - 1 ? published[idx + 1] : null,
      },
    };
  });
}

/**
 * Generate routes for standalone pages.
 */
export function generatePageRoutes(pages: PostData[]): Route[] {
  return pages.map((page) => {
    // Page path: strip leading _pages/ or similar, keep relative structure
    let pagePath = page.path.replace(/\.(md|markdown)$/, '.html');
    // Remove any leading prefix
    pagePath = pagePath.replace(/^_pages\//, '');

    return {
      path: pagePath,
      layout: ['page', 'index'],
      data: page,
    };
  });
}

// ─── Permalink Builder ───────────────────────────────────────────────────────

function buildPermalink(
  pattern: string,
  vars: { slug: string; date: string; title: string },
): string {
  const d = vars.date ? new Date(vars.date) : new Date();
  const year = String(d.getFullYear());
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return pattern
    .replace(':year', year)
    .replace(':month', month)
    .replace(':day', day)
    .replace(':title', vars.slug || vars.title)
    .replace(':slug', vars.slug)
    .replace(/\/+/g, '/')
    .replace(/^\//, '');
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function generatorPlugin(
  options: GeneratorOptions = {},
): NeoHexoPlugin {
  const { permalink = ':year/:month/:day/:title/' } = options;

  return {
    name: 'neo-hexo:generator',

    hooks: {
      generateRoutes(locals: SiteLocals): Route[] {
        const posts = locals.posts as PostData[];
        const pages = locals.pages as PostData[];

        const postRoutes = generatePostRoutes(posts, permalink);
        const pageRoutes = generatePageRoutes(pages);

        return [...postRoutes, ...pageRoutes];
      },
    },
  };
}

// Re-export
export type { GeneratorOptions as Options };
