/**
 * @neo-hexo/renderer-edge
 *
 * Edge.js template engine plugin for Neo-Hexo.
 * Registers a Renderer for `.edge` template files.
 *
 * Usage:
 * ```ts
 * import edgeRenderer from '@neo-hexo/renderer-edge';
 *
 * export default defineConfig({
 *   plugins: [edgeRenderer({ viewsDir: 'themes/my-theme' })],
 * });
 * ```
 */

import type { NeoHexoPlugin, Context, Renderer } from '@neo-hexo/core';
import { RenderServiceKey, HelperRegistryKey, createServiceKey } from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EdgeOptions {
  /** Base directory for Edge.js template resolution. */
  viewsDir?: string;
  /** Additional global data to pass to all templates. */
  globals?: Record<string, unknown>;
}

export interface EdgeInstance {
  render(templatePath: string, data: Record<string, unknown>): Promise<string>;
  renderRaw(source: string, data: Record<string, unknown>): Promise<string>;
  /** Mount an additional views directory for template resolution. */
  mount(dir: string): void;
}

// ─── Service Key ─────────────────────────────────────────────────────────────

export const EdgeInstanceKey = createServiceKey<EdgeInstance>('renderer:edge');

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function edgeRendererPlugin(
  options: EdgeOptions = {},
): NeoHexoPlugin {
  const { viewsDir, globals = {} } = options;

  return {
    name: 'neo-hexo:renderer-edge',
    enforce: 'pre',

    async apply(ctx: Context) {
      // Lazy-load Edge.js
      const { Edge } = await import('edge.js');
      const edge = new Edge();

      // Mount views directory if provided
      if (viewsDir) {
        edge.mount(viewsDir);
      }

      // Register global data
      for (const [key, value] of Object.entries(globals)) {
        edge.global(key, value);
      }

      // Inject helpers from HelperRegistry as Edge globals
      const helperRegistry = ctx.tryInject(HelperRegistryKey);
      if (helperRegistry) {
        for (const name of helperRegistry.list()) {
          const fn = helperRegistry.get(name);
          if (fn) {
            edge.global(name, fn);
          }
        }
      }

      // Create the Edge instance wrapper
      const instance: EdgeInstance = {
        async render(templatePath: string, data: Record<string, unknown>): Promise<string> {
          return edge.render(templatePath, data);
        },
        async renderRaw(source: string, data: Record<string, unknown>): Promise<string> {
          return edge.renderRaw(source, data);
        },
        /** Mount an additional views directory (e.g. theme layout dir). */
        mount(dir: string): void {
          edge.mount(dir);
        },
      };

      ctx.provide(EdgeInstanceKey, instance);

      // Create and register the Renderer
      const renderer: Renderer = {
        extensions: ['edge'],
        output: 'html',
        async render(source: string, options?: Record<string, unknown>) {
          return edge.renderRaw(source, options ?? {});
        },
      };

      // Register with the render pipeline
      const pipeline = ctx.tryInject(RenderServiceKey);
      if (pipeline) {
        const unregister = pipeline.register(renderer);
        return { dispose: unregister };
      }
    },
  };
}

// Re-export
export type { EdgeOptions as Options };
