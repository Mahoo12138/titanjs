/**
 * Tests for @neo-hexo/cli — plugin-resolver
 */

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_PLUGINS,
  getBuiltinPluginNames,
  createPluginResolver,
} from '../src/plugin-resolver.js';

describe('Plugin Resolver', () => {
  // ── BUILTIN_PLUGINS map ────────────────────────────────────────────────────

  describe('BUILTIN_PLUGINS', () => {
    it('should map shorthand names to @neo-hexo/* packages', () => {
      expect(BUILTIN_PLUGINS['renderer-markdown']).toBe('@neo-hexo/renderer-markdown');
      expect(BUILTIN_PLUGINS['renderer-edge']).toBe('@neo-hexo/renderer-edge');
      expect(BUILTIN_PLUGINS['processor']).toBe('@neo-hexo/processor');
      expect(BUILTIN_PLUGINS['generator']).toBe('@neo-hexo/generator');
      expect(BUILTIN_PLUGINS['filter']).toBe('@neo-hexo/filter');
      expect(BUILTIN_PLUGINS['helper']).toBe('@neo-hexo/helper');
      expect(BUILTIN_PLUGINS['highlight']).toBe('@neo-hexo/highlight');
      expect(BUILTIN_PLUGINS['injector']).toBe('@neo-hexo/injector');
      expect(BUILTIN_PLUGINS['console']).toBe('@neo-hexo/console');
      expect(BUILTIN_PLUGINS['deployer-git']).toBe('@neo-hexo/deployer-git');
    });

    it('should have 10 built-in plugins', () => {
      expect(Object.keys(BUILTIN_PLUGINS)).toHaveLength(10);
    });
  });

  // ── getBuiltinPluginNames ──────────────────────────────────────────────────

  describe('getBuiltinPluginNames', () => {
    it('should return all shorthand names', () => {
      const names = getBuiltinPluginNames();
      expect(names).toContain('renderer-markdown');
      expect(names).toContain('processor');
      expect(names).toContain('deployer-git');
      expect(names).toHaveLength(10);
    });
  });

  // ── createPluginResolver ───────────────────────────────────────────────────

  describe('createPluginResolver', () => {
    it('should return a function', () => {
      const resolver = createPluginResolver();
      expect(typeof resolver).toBe('function');
    });

    it('should throw for a non-existent package', async () => {
      const resolver = createPluginResolver();
      await expect(
        resolver('nonexistent-plugin-xyz-12345', {}),
      ).rejects.toThrow(/Failed to load plugin/);
    });
  });
});
