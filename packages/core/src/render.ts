/**
 * @neo-hexo/core — Render Pipeline
 *
 * The rendering system dispatches files to registered renderer services
 * based on file extension. Renderers are registered via the service container,
 * not as a built-in registry — making them fully pluggable.
 *
 * Replaces lib/hexo/render.ts.
 */

import * as nodePath from 'node:path';
import { createServiceKey, type ServiceKey, type Context } from './context.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A renderer handles a specific file format. */
export interface Renderer {
  /** File extensions this renderer handles (without dots). e.g., ['md', 'markdown'] */
  extensions: string[];
  /** Output extension (without dot). e.g., 'html' */
  output: string;
  /** Render source content to output format. */
  render(source: string, options?: RenderOptions): string | Promise<string>;
  /** Optional: mount a directory for template resolution (e.g., layout dir). */
  mount?(dir: string): void;
}

/** Options passed to a renderer. */
export interface RenderOptions {
  /** The source file path (if available). */
  path?: string;
  /** The output engine to use (overrides extension-based dispatch). */
  engine?: string;
  /** Additional data available to the renderer. */
  [key: string]: unknown;
}

/** Result from a render operation. */
export interface RenderResult {
  /** Rendered output. */
  content: string;
  /** Output extension. */
  outputExt: string;
  /** The renderer that was used. */
  renderer: string;
}

// ─── Service Keys ────────────────────────────────────────────────────────────

/** Service key for the render pipeline itself. */
export const RenderServiceKey: ServiceKey<RenderPipeline> = createServiceKey<RenderPipeline>('render');

// ─── Render Pipeline ─────────────────────────────────────────────────────────

export class RenderPipeline {
  /** Map from extension → Renderer */
  private renderers = new Map<string, Renderer>();

  /**
   * Register a renderer for one or more file extensions.
   *
   * @returns A cleanup function to unregister.
   */
  register(renderer: Renderer): () => void {
    for (const ext of renderer.extensions) {
      this.renderers.set(ext.toLowerCase(), renderer);
    }

    return () => {
      for (const ext of renderer.extensions) {
        if (this.renderers.get(ext.toLowerCase()) === renderer) {
          this.renderers.delete(ext.toLowerCase());
        }
      }
    };
  }

  /**
   * Render source content using the appropriate renderer.
   *
   * @param source - The source content to render.
   * @param options - Render options (must include path or engine).
   * @returns The rendered result.
   * @throws If no renderer is found for the given extension.
   */
  async render(source: string, options: RenderOptions = {}): Promise<RenderResult> {
    const ext = this.resolveExtension(options);
    const renderer = this.renderers.get(ext);

    if (!renderer) {
      // No renderer — return source as-is (passthrough)
      return {
        content: source,
        outputExt: nodePath.extname(options.path ?? '').slice(1) || 'html',
        renderer: 'passthrough',
      };
    }

    const content = await renderer.render(source, options);

    return {
      content,
      outputExt: renderer.output,
      renderer: renderer.extensions[0] ?? ext,
    };
  }

  /**
   * Check whether a file can be rendered (has a registered renderer).
   */
  isRenderable(filePath: string): boolean {
    const ext = nodePath.extname(filePath).slice(1).toLowerCase();
    return this.renderers.has(ext);
  }

  /**
   * Get the output extension for a file path.
   */
  getOutputExt(filePath: string): string {
    const ext = nodePath.extname(filePath).slice(1).toLowerCase();
    const renderer = this.renderers.get(ext);
    return renderer?.output ?? ext;
  }

  /**
   * Get all registered extensions.
   */
  getRegisteredExtensions(): string[] {
    return [...this.renderers.keys()];
  }

  /**
   * Mount a directory for template resolution on renderers that support it.
   */
  mountDir(dir: string): void {
    for (const renderer of new Set(this.renderers.values())) {
      if (typeof renderer.mount === 'function') {
        renderer.mount(dir);
      }
    }
  }

  // ── Private ──

  private resolveExtension(options: RenderOptions): string {
    if (options.engine) {
      return options.engine.toLowerCase();
    }
    if (options.path) {
      return nodePath.extname(options.path).slice(1).toLowerCase();
    }
    return '';
  }
}

/**
 * Create a RenderPipeline and register it in the context.
 */
export function createRenderPipeline(ctx: Context): RenderPipeline {
  const pipeline = new RenderPipeline();
  ctx.provide(RenderServiceKey, pipeline);
  return pipeline;
}
