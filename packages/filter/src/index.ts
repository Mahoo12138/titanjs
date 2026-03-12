/**
 * @neo-hexo/filter
 *
 * Built-in filters for Neo-Hexo.
 * Registers as hook taps for post-processing, permalinks, external links, etc.
 *
 * Usage:
 * ```ts
 * import filters from '@neo-hexo/filter';
 *
 * export default defineConfig({
 *   plugins: [filters()],
 * });
 * ```
 */

import type { NeoHexoPlugin, PostData, ResolvedConfig } from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FilterOptions {
  /** Add target="_blank" and rel="noopener" to external links (default: true). */
  externalLinks?: boolean;
  /** Apply titlecase to post titles (default: false). */
  titlecase?: boolean;
  /** Remove fenced code blocks before tag rendering (default: true). */
  codeEscape?: boolean;
  /** Auto-generate meta_generator tag (default: true). */
  metaGenerator?: boolean;
}

// ─── Filter Implementations ─────────────────────────────────────────────────

/**
 * Process external links: add target="_blank" and rel="noopener".
 */
export function externalLinkFilter(content: string, siteUrl?: string): string {
  const domain = siteUrl ? new URL(siteUrl).hostname : '';

  return content.replace(
    /<a\s([^>]*?)href="(https?:\/\/[^"]*?)"([^>]*?)>/gi,
    (match, before: string, href: string, after: string) => {
      // Skip if already has target, or if it's an internal link
      if (/target=/i.test(before + after)) return match;

      try {
        const url = new URL(href);
        if (domain && url.hostname === domain) return match;
      } catch {
        return match;
      }

      const relAttr = /rel=/i.test(before + after) ? '' : ' rel="noopener"';
      return `<a ${before}href="${href}"${after} target="_blank"${relAttr}>`;
    },
  );
}

/**
 * Title case a string: capitalize the first letter of each major word.
 */
export function titlecaseFilter(title: string): string {
  const minorWords = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to',
    'by', 'in', 'of', 'up', 'as', 'is', 'it',
  ]);

  return title.replace(/\w\S*/g, (word, index: number) => {
    if (index !== 0 && minorWords.has(word.toLowerCase())) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Excerpt filter: split content at the `<!-- more -->` marker.
 * This is also handled by front-matter parsing, but this catches
 * cases where excerpts are generated post-render.
 */
export function excerptFilter(data: PostData): PostData {
  if (data.excerpt) return data;

  const marker = '<!-- more -->';
  const idx = data.content.indexOf(marker);
  if (idx >= 0) {
    return {
      ...data,
      excerpt: data.content.slice(0, idx).trim(),
    };
  }

  return data;
}

/**
 * Meta generator tag: adds Neo-Hexo version info.
 */
export function metaGeneratorFilter(html: string): string {
  const tag = '<meta name="generator" content="Neo-Hexo">';
  if (html.includes('name="generator"')) return html;
  return html.replace('</head>', `${tag}\n</head>`);
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function filterPlugin(options: FilterOptions = {}): NeoHexoPlugin {
  const {
    externalLinks = true,
    titlecase = false,
    codeEscape: _codeEscape = true,
    metaGenerator = true,
  } = options;

  let siteUrl: string | undefined;

  return {
    name: 'neo-hexo:filter',

    hooks: {
      configResolved(config: ResolvedConfig) {
        siteUrl = config.url;
      },

      beforePostRender(data: PostData): PostData {
        // Apply titlecase to post title
        if (titlecase && typeof data.frontMatter['title'] === 'string') {
          data = {
            ...data,
            frontMatter: {
              ...data.frontMatter,
              title: titlecaseFilter(data.frontMatter['title'] as string),
            },
          };
        }
        return data;
      },

      afterPostRender(data: PostData): PostData {
        let result = data;

        // External links filter
        if (externalLinks) {
          result = {
            ...result,
            content: externalLinkFilter(result.content, siteUrl),
          };
          if (result.excerpt) {
            result = {
              ...result,
              excerpt: externalLinkFilter(result.excerpt, siteUrl),
            };
          }
        }

        // Excerpt filter
        result = excerptFilter(result);

        return result;
      },

      afterHtmlRender(html: string): string {
        if (metaGenerator) {
          return metaGeneratorFilter(html);
        }
        return html;
      },
    },
  };
}

// Re-export
export type { FilterOptions as Options };
