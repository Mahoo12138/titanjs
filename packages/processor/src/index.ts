/**
 * @neo-hexo/processor
 *
 * Built-in file processors for Neo-Hexo.
 * Registers Box processors for posts, pages, assets, and data files.
 *
 * Usage:
 * ```ts
 * import processors from '@neo-hexo/processor';
 *
 * export default defineConfig({
 *   plugins: [processors()],
 * });
 * ```
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import type {
  NeoHexoPlugin,
  Context,
  SourceFile,
  PostData,
  PostProcessor,
  SiteLocals,
} from '@neo-hexo/core';
import { PostServiceKey } from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProcessorOptions {
  /** Directory for posts (default: '_posts'). */
  postDir?: string;
  /** Directory for drafts (default: '_drafts'). */
  draftDir?: string;
  /** Directory for data files (default: '_data'). */
  dataDir?: string;
  /** Whether to process draft posts (default: false). */
  includeDrafts?: boolean;
}

// ─── Collected Data (stored in context) ──────────────────────────────────────

export interface ProcessedData {
  posts: PostData[];
  pages: PostData[];
  dataFiles: Map<string, unknown>;
  assets: string[];
}

import { createServiceKey } from '@neo-hexo/core';
export const ProcessedDataKey = createServiceKey<ProcessedData>('processedData');

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function processorPlugin(
  options: ProcessorOptions = {},
): NeoHexoPlugin {
  const {
    postDir = '_posts',
    draftDir = '_drafts',
    dataDir = '_data',
    includeDrafts = false,
  } = options;

  // Shared closure state between apply() and hooks
  const data: ProcessedData = {
    posts: [],
    pages: [],
    dataFiles: new Map(),
    assets: [],
  };
  let postProcessor: PostProcessor | null = null;

  return {
    name: 'neo-hexo:processor',
    enforce: 'pre',

    apply(ctx: Context) {
      ctx.provide(ProcessedDataKey, data);
      postProcessor = ctx.tryInject(PostServiceKey) ?? null;

      return {
        dispose() {
          data.posts.length = 0;
          data.pages.length = 0;
          data.dataFiles.clear();
          data.assets.length = 0;
        },
      };
    },

    hooks: {
      // Populate SiteLocals with processed data before generators run
      beforeGenerate(locals: SiteLocals) {
        locals.posts = data.posts;
        locals.pages = data.pages;
        locals.data = Object.fromEntries(data.dataFiles);
      },

      async processFile(file: SourceFile) {
        const fileType = classifyFile(file.path, { postDir, draftDir, dataDir });

        if (file.type === 'delete') {
          if (fileType === 'post' || fileType === 'draft') {
            const idx = data.posts.findIndex((p) => p.path === file.path);
            if (idx !== -1) data.posts.splice(idx, 1);
          } else if (fileType === 'page') {
            const idx = data.pages.findIndex((p) => p.path === file.path);
            if (idx !== -1) data.pages.splice(idx, 1);
          } else if (fileType === 'data') {
            const ext = nodePath.extname(file.path);
            const key = nodePath.basename(file.path, ext);
            data.dataFiles.delete(key);
          }
          return;
        }

        if (fileType === 'post' || (fileType === 'draft' && includeDrafts)) {
          if (postProcessor) {
            const postData = await processPost(file, postProcessor);
            if (postData) {
              const rendered = await postProcessor.render(postData);
              data.posts.push(rendered);
            }
          }
        } else if (fileType === 'page') {
          if (postProcessor) {
            const pageData = await processPost(file, postProcessor);
            if (pageData) {
              const rendered = await postProcessor.render(pageData);
              data.pages.push(rendered);
            }
          }
        } else if (fileType === 'data') {
          const result = await processDataFile(file);
          if (result) {
            data.dataFiles.set(result.key, result.value);
          }
        } else {
          data.assets.push(file.path);
        }
      },
    },
  };
}

// ─── Individual Processors ───────────────────────────────────────────────────

/**
 * Determine the file type based on its path.
 */
export function classifyFile(
  path: string,
  options: { postDir: string; draftDir: string; dataDir: string },
): 'post' | 'draft' | 'data' | 'page' | 'asset' {
  const normalized = path.replace(/\\/g, '/');

  if (normalized.startsWith(options.postDir + '/')) return 'post';
  if (normalized.startsWith(options.draftDir + '/')) return 'draft';
  if (normalized.startsWith(options.dataDir + '/')) return 'data';

  // Renderable files without a leading _ are pages
  const ext = nodePath.extname(normalized).toLowerCase();
  if (['.md', '.markdown', '.html', '.htm'].includes(ext)) return 'page';

  return 'asset';
}

/**
 * Process a post source file.
 */
export async function processPost(
  file: SourceFile,
  postProcessor: PostProcessor,
): Promise<PostData | null> {
  if (file.type === 'delete') return null;

  const content = file.content ?? await fs.readFile(file.source, 'utf-8');
  return postProcessor.parse(content, file.path);
}

/**
 * Process a data file (YAML/JSON).
 */
export async function processDataFile(
  file: SourceFile,
): Promise<{ key: string; value: unknown } | null> {
  if (file.type === 'delete') return null;

  const content = file.content ?? await fs.readFile(file.source, 'utf-8');
  const ext = nodePath.extname(file.path).toLowerCase();
  const key = nodePath.basename(file.path, ext);

  if (ext === '.json') {
    return { key, value: JSON.parse(content) };
  }

  // Simple YAML key-value parsing for .yml/.yaml
  if (ext === '.yml' || ext === '.yaml') {
    const data: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0 && !line.startsWith('#')) {
        data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
    return { key, value: data };
  }

  return null;
}

// Re-export types
export type { ProcessorOptions as Options };
