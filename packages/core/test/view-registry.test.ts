/**
 * Tests for @neo-hexo/core — ViewRegistry
 */

import { describe, it, expect } from 'vitest';
import { ViewRegistry, type View } from '../src/view-registry.js';

function createView(name: string): View {
  return {
    name,
    source: `/theme/layout/${name}.edge`,
    async render(locals) {
      return `<html>${name}: ${JSON.stringify(locals)}</html>`;
    },
  };
}

describe('ViewRegistry', () => {
  it('should register and retrieve a view', () => {
    const registry = new ViewRegistry();
    const view = createView('post');
    registry.set('post', view);
    expect(registry.get('post')).toBe(view);
  });

  it('should return undefined for unknown view', () => {
    const registry = new ViewRegistry();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should check existence with has()', () => {
    const registry = new ViewRegistry();
    registry.set('index', createView('index'));
    expect(registry.has('index')).toBe(true);
    expect(registry.has('missing')).toBe(false);
  });

  it('should remove a view', () => {
    const registry = new ViewRegistry();
    registry.set('page', createView('page'));
    expect(registry.remove('page')).toBe(true);
    expect(registry.has('page')).toBe(false);
    expect(registry.remove('page')).toBe(false);
  });

  it('should list all view names', () => {
    const registry = new ViewRegistry();
    registry.set('post', createView('post'));
    registry.set('page', createView('page'));
    registry.set('index', createView('index'));
    expect(registry.list().sort()).toEqual(['index', 'page', 'post']);
  });

  it('should report size', () => {
    const registry = new ViewRegistry();
    expect(registry.size).toBe(0);
    registry.set('a', createView('a'));
    registry.set('b', createView('b'));
    expect(registry.size).toBe(2);
  });

  it('should clear all views', () => {
    const registry = new ViewRegistry();
    registry.set('a', createView('a'));
    registry.set('b', createView('b'));
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('should overwrite duplicate view names', () => {
    const registry = new ViewRegistry();
    const v1 = createView('post');
    const v2 = createView('post');
    registry.set('post', v1);
    registry.set('post', v2);
    expect(registry.get('post')).toBe(v2);
    expect(registry.size).toBe(1);
  });

  describe('resolve (layout fallback)', () => {
    it('should resolve the first matching layout', () => {
      const registry = new ViewRegistry();
      registry.set('post', createView('post'));
      registry.set('page', createView('page'));
      registry.set('index', createView('index'));

      const view = registry.resolve(['post', 'page', 'index']);
      expect(view).toBeDefined();
      expect(view!.name).toBe('post');
    });

    it('should fall back to later layouts if earlier ones are missing', () => {
      const registry = new ViewRegistry();
      registry.set('index', createView('index'));

      const view = registry.resolve(['post', 'page', 'index']);
      expect(view).toBeDefined();
      expect(view!.name).toBe('index');
    });

    it('should return undefined if no layouts match', () => {
      const registry = new ViewRegistry();
      registry.set('index', createView('index'));

      expect(registry.resolve(['post', 'page'])).toBeUndefined();
    });

    it('should return undefined for empty layout list', () => {
      const registry = new ViewRegistry();
      expect(registry.resolve([])).toBeUndefined();
    });
  });

  describe('view rendering', () => {
    it('should render a view with locals', async () => {
      const registry = new ViewRegistry();
      const view = createView('post');
      registry.set('post', view);

      const result = await view.render({ title: 'Hello' });
      expect(result).toContain('post');
      expect(result).toContain('Hello');
    });
  });
});
