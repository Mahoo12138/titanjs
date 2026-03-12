/**
 * @neo-hexo/core — View Registry
 *
 * Stores compiled template views keyed by layout name.
 * Theme plugins register views here; the render pipeline
 * resolves layouts when rendering routes.
 */

import { createServiceKey, type ServiceKey } from './context.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A compiled view that can render data to HTML.
 */
export interface View {
  /** Layout name (e.g. 'post', 'page', 'index'). */
  name: string;
  /** Source file path (for debugging and HMR). */
  source: string;
  /** Render this view with given locals. */
  render(locals: Record<string, unknown>): string | Promise<string>;
}

/**
 * Resolves a list of candidate layout names to the first available View.
 */
export interface ViewResolver {
  /**
   * Find the first matching view from a list of layout candidates.
   * Returns `undefined` if no match found.
   */
  resolve(layouts: string[]): View | undefined;
}

// ─── Service Key ─────────────────────────────────────────────────────────────

export const ViewRegistryKey: ServiceKey<ViewRegistry> =
  createServiceKey<ViewRegistry>('viewRegistry');

// ─── View Registry ───────────────────────────────────────────────────────────

/**
 * Registry of template views.
 * Views are stored by layout name (without extension).
 * When multiple views share a name, the last one registered wins.
 */
export class ViewRegistry implements ViewResolver {
  private views = new Map<string, View>();

  /** Register a view. Overwrites any existing view with the same name. */
  set(name: string, view: View): void {
    this.views.set(name, view);
  }

  /** Get a view by exact name. */
  get(name: string): View | undefined {
    return this.views.get(name);
  }

  /** Remove a view by name. */
  remove(name: string): boolean {
    return this.views.delete(name);
  }

  /** Whether a view exists for this name. */
  has(name: string): boolean {
    return this.views.has(name);
  }

  /**
   * Resolve the first matching layout from a candidate list.
   *
   * Given `['post', 'page', 'index']`, returns the view for the first
   * layout that exists in the registry.
   */
  resolve(layouts: string[]): View | undefined {
    for (const name of layouts) {
      const view = this.views.get(name);
      if (view) return view;
    }
    return undefined;
  }

  /** List all registered view names. */
  list(): string[] {
    return [...this.views.keys()];
  }

  /** Number of registered views. */
  get size(): number {
    return this.views.size;
  }

  /** Clear all views. */
  clear(): void {
    this.views.clear();
  }
}
