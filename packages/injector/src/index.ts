/**
 * @neo-hexo/injector
 *
 * HTML injection plugin for Neo-Hexo.
 * Allows plugins and themes to inject content into `<head>`,
 * start of `<body>`, or end of `<body>`.
 *
 * Usage:
 * ```ts
 * import injector from '@neo-hexo/injector';
 *
 * export default defineConfig({
 *   plugins: [injector()],
 * });
 * ```
 *
 * Then in your plugin:
 * ```ts
 * const inj = ctx.inject(InjectorKey);
 * inj.add('head_end', '<link rel="stylesheet" href="/custom.css">');
 * inj.add('body_end', '<script src="/analytics.js"></script>');
 * ```
 */

import type { NeoHexoPlugin, Context } from '@neo-hexo/core';
import { createServiceKey } from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Injection points in the HTML document. */
export type InjectionPoint = 'head_begin' | 'head_end' | 'body_begin' | 'body_end';

export interface InjectorEntry {
  content: string;
  /** Higher priority items are injected first (default: 0). */
  priority?: number;
}

export interface InjectorService {
  /** Add content at an injection point. */
  add(point: InjectionPoint, content: string, priority?: number): void;
  /** Get all entries for a given point, sorted by priority. */
  get(point: InjectionPoint): string[];
  /** Get rendered text for a point (joined). */
  text(point: InjectionPoint): string;
  /** Clear all entries. */
  clear(): void;
}

// ─── Service Key ─────────────────────────────────────────────────────────────

export const InjectorKey = createServiceKey<InjectorService>('injector');

// ─── Injector Implementation ─────────────────────────────────────────────────

class Injector implements InjectorService {
  private entries = new Map<InjectionPoint, InjectorEntry[]>();

  add(point: InjectionPoint, content: string, priority = 0): void {
    if (!this.entries.has(point)) {
      this.entries.set(point, []);
    }
    this.entries.get(point)!.push({ content, priority });
  }

  get(point: InjectionPoint): string[] {
    const items = this.entries.get(point);
    if (!items || items.length === 0) return [];
    return [...items]
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((e) => e.content);
  }

  text(point: InjectionPoint): string {
    return this.get(point).join('\n');
  }

  clear(): void {
    this.entries.clear();
  }
}

// ─── HTML Injection ──────────────────────────────────────────────────────────

/**
 * Inject collected content into an HTML string at the appropriate points.
 */
function injectIntoHtml(html: string, injector: InjectorService): string {
  let result = html;

  const headBegin = injector.text('head_begin');
  if (headBegin) {
    result = result.replace(/<head([^>]*)>/i, `<head$1>\n${headBegin}`);
  }

  const headEnd = injector.text('head_end');
  if (headEnd) {
    result = result.replace('</head>', `${headEnd}\n</head>`);
  }

  const bodyBegin = injector.text('body_begin');
  if (bodyBegin) {
    result = result.replace(/<body([^>]*)>/i, `<body$1>\n${bodyBegin}`);
  }

  const bodyEnd = injector.text('body_end');
  if (bodyEnd) {
    result = result.replace('</body>', `${bodyEnd}\n</body>`);
  }

  return result;
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function injectorPlugin(): NeoHexoPlugin {
  let injector: Injector;

  return {
    name: 'neo-hexo:injector',
    enforce: 'pre',

    apply(ctx: Context) {
      injector = new Injector();
      ctx.provide(InjectorKey, injector);

      return {
        dispose() {
          injector.clear();
        },
      };
    },

    hooks: {
      afterHtmlRender(html: string): string {
        return injectIntoHtml(html, injector);
      },
    },
  };
}

// Re-export
export { injectIntoHtml };
