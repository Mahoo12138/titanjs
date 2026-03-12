/**
 * Tests for @neo-hexo/core config system — YAML config types and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  defineConfig,
  resolveConfig,
  defaultConfig,
  normalizePluginEntry,
  yamlConfigToUserConfig,
  type YamlConfig,
  type YamlPluginEntry,
  type PluginResolver,
  type UserConfig,
} from '../src/config.js';

describe('Config System', () => {
  // ── defineConfig ───────────────────────────────────────────────────────────

  describe('defineConfig', () => {
    it('should return the config as-is (identity helper)', () => {
      const cfg: UserConfig = { title: 'Test' };
      expect(defineConfig(cfg)).toBe(cfg);
    });
  });

  // ── resolveConfig ──────────────────────────────────────────────────────────

  describe('resolveConfig', () => {
    it('should merge user config with defaults', () => {
      const resolved = resolveConfig({ title: 'My Site' }, '/project');
      expect(resolved.title).toBe('My Site');
      expect(resolved.subtitle).toBe('');
      expect(resolved.sourceDir).toBe('source');
      expect(resolved.publicDir).toBe('public');
      expect(resolved._baseDir).toBe('/project');
    });

    it('should merge nested database config', () => {
      const resolved = resolveConfig(
        { database: { adapter: 'sqlite' } },
        '/project',
      );
      expect(resolved.database.adapter).toBe('sqlite');
      expect(resolved.database.path).toBe('db.json');
    });

    it('should use all defaults when user config is empty', () => {
      const resolved = resolveConfig({}, '/test');
      expect(resolved.title).toBe(defaultConfig.title);
      expect(resolved.permalink).toBe(defaultConfig.permalink);
    });
  });

  // ── normalizePluginEntry ───────────────────────────────────────────────────

  describe('normalizePluginEntry', () => {
    it('should normalize a string entry', () => {
      const result = normalizePluginEntry('renderer-markdown');
      expect(result).toEqual({ name: 'renderer-markdown', options: {} });
    });

    it('should normalize an object entry with options', () => {
      const entry: YamlPluginEntry = {
        name: 'highlight',
        theme: 'github-dark',
        lineNumbers: true,
      };
      const result = normalizePluginEntry(entry);
      expect(result).toEqual({
        name: 'highlight',
        options: { theme: 'github-dark', lineNumbers: true },
      });
    });

    it('should normalize an object entry with only name', () => {
      const entry: YamlPluginEntry = { name: 'processor' };
      const result = normalizePluginEntry(entry);
      expect(result).toEqual({ name: 'processor', options: {} });
    });
  });

  // ── yamlConfigToUserConfig ─────────────────────────────────────────────────

  describe('yamlConfigToUserConfig', () => {
    it('should convert YAML config with no plugins', async () => {
      const yaml: YamlConfig = { title: 'Test', url: 'http://example.com' };
      const resolver: PluginResolver = () => ({ name: 'unused' });
      const result = await yamlConfigToUserConfig(yaml, resolver);
      expect(result.title).toBe('Test');
      expect(result.url).toBe('http://example.com');
      expect(result.plugins).toEqual([]);
    });

    it('should resolve string plugin entries via the resolver', async () => {
      const yaml: YamlConfig = {
        title: 'Test',
        plugins: ['foo', 'bar'],
      };
      const resolver: PluginResolver = (name, options) => ({
        name: `resolved-${name}`,
      });
      const result = await yamlConfigToUserConfig(yaml, resolver);
      expect(result.plugins).toHaveLength(2);
      expect(result.plugins![0].name).toBe('resolved-foo');
      expect(result.plugins![1].name).toBe('resolved-bar');
    });

    it('should pass options from object entries to the resolver', async () => {
      const yaml: YamlConfig = {
        plugins: [{ name: 'highlight', theme: 'dark' }],
      };
      let receivedOptions: Record<string, unknown> = {};
      const resolver: PluginResolver = (name, options) => {
        receivedOptions = options;
        return { name: `resolved-${name}` };
      };
      await yamlConfigToUserConfig(yaml, resolver);
      expect(receivedOptions).toEqual({ theme: 'dark' });
    });

    it('should handle async resolvers', async () => {
      const yaml: YamlConfig = { plugins: ['async-plugin'] };
      const resolver: PluginResolver = async (name) => {
        return { name: `async-${name}` };
      };
      const result = await yamlConfigToUserConfig(yaml, resolver);
      expect(result.plugins![0].name).toBe('async-async-plugin');
    });

    it('should preserve non-plugin YAML config fields', async () => {
      const yaml: YamlConfig = {
        title: 'Site',
        subtitle: 'Sub',
        description: 'Desc',
        author: 'Author',
        language: ['en', 'zh'],
        sourceDir: 'src',
        publicDir: 'out',
        permalink: ':title/',
        plugins: [],
      };
      const resolver: PluginResolver = () => ({ name: 'unused' });
      const result = await yamlConfigToUserConfig(yaml, resolver);
      expect(result.title).toBe('Site');
      expect(result.subtitle).toBe('Sub');
      expect(result.description).toBe('Desc');
      expect(result.author).toBe('Author');
      expect(result.language).toEqual(['en', 'zh']);
      expect(result.sourceDir).toBe('src');
      expect(result.publicDir).toBe('out');
      expect(result.permalink).toBe(':title/');
      expect(result.plugins).toEqual([]);
    });
  });
});
