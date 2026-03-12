/**
 * Tests for @neo-hexo/theme — theme plugin utilities and plugin behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import {
  walkDir,
  stripExt,
  loadViews,
  loadThemeConfig,
  loadThemeAssets,
  loadLanguages,
} from '../src/index.js';

describe('Theme Utilities', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'neo-hexo-theme-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── walkDir ──────────────────────────────────────────────────────────────

  describe('walkDir', () => {
    it('should list all files recursively', async () => {
      await fs.mkdir(nodePath.join(tmpDir, 'sub'), { recursive: true });
      await fs.writeFile(nodePath.join(tmpDir, 'a.txt'), 'a');
      await fs.writeFile(nodePath.join(tmpDir, 'sub/b.txt'), 'b');

      const files = await walkDir(tmpDir);
      expect(files.sort()).toEqual(['a.txt', 'sub/b.txt']);
    });

    it('should return empty for non-existent directory', async () => {
      const files = await walkDir(nodePath.join(tmpDir, 'nope'));
      expect(files).toEqual([]);
    });

    it('should return empty for empty directory', async () => {
      const files = await walkDir(tmpDir);
      expect(files).toEqual([]);
    });
  });

  // ── stripExt ─────────────────────────────────────────────────────────────

  describe('stripExt', () => {
    it('should strip file extension', () => {
      expect(stripExt('post.edge')).toBe('post');
      expect(stripExt('partials/header.edge')).toBe('partials/header');
    });

    it('should handle no extension', () => {
      expect(stripExt('Makefile')).toBe('Makefile');
    });

    it('should handle multiple dots', () => {
      expect(stripExt('file.test.ts')).toBe('file.test');
    });
  });

  // ── loadViews ────────────────────────────────────────────────────────────

  describe('loadViews', () => {
    it('should load template files as views', async () => {
      const layoutDir = nodePath.join(tmpDir, 'layout');
      await fs.mkdir(layoutDir, { recursive: true });
      await fs.writeFile(nodePath.join(layoutDir, 'post.edge'), '<h1>{{ title }}</h1>');
      await fs.writeFile(nodePath.join(layoutDir, 'index.edge'), '<main>{{ body }}</main>');

      const renderFn = async (source: string, _ext: string, _locals: Record<string, unknown>) => {
        return `RENDERED:${source}`;
      };

      const views = await loadViews(layoutDir, renderFn);
      expect(views).toHaveLength(2);

      const names = views.map(v => v.name).sort();
      expect(names).toEqual(['index', 'post']);

      // Each view should have source path set
      const postView = views.find(v => v.name === 'post')!;
      expect(postView.source).toContain('post.edge');
    });

    it('should render via the provided render function', async () => {
      const layoutDir = nodePath.join(tmpDir, 'layout');
      await fs.mkdir(layoutDir, { recursive: true });
      await fs.writeFile(nodePath.join(layoutDir, 'test.edge'), 'Hello {{ name }}');

      const renderFn = async (source: string, ext: string, locals: Record<string, unknown>) => {
        return `[${ext}] ${source} -> ${JSON.stringify(locals)}`;
      };

      const views = await loadViews(layoutDir, renderFn);
      const result = await views[0]!.render({ name: 'World' });
      expect(result).toContain('[edge]');
      expect(result).toContain('Hello {{ name }}');
    });

    it('should handle nested layout directories', async () => {
      const layoutDir = nodePath.join(tmpDir, 'layout');
      await fs.mkdir(nodePath.join(layoutDir, 'partials'), { recursive: true });
      await fs.writeFile(nodePath.join(layoutDir, 'partials/header.edge'), '<header/>');

      const renderFn = async (source: string) => source;
      const views = await loadViews(layoutDir, renderFn);
      expect(views).toHaveLength(1);
      expect(views[0]!.name).toBe('partials/header');
    });

    it('should return empty for non-existent layout dir', async () => {
      const renderFn = async (source: string) => source;
      const views = await loadViews(nodePath.join(tmpDir, 'nope'), renderFn);
      expect(views).toEqual([]);
    });
  });

  // ── loadThemeConfig ──────────────────────────────────────────────────────

  describe('loadThemeConfig', () => {
    it('should load _config.yaml from theme dir', async () => {
      const themeDir = nodePath.join(tmpDir, 'my-theme');
      await fs.mkdir(themeDir, { recursive: true });
      await fs.writeFile(
        nodePath.join(themeDir, '_config.yaml'),
        'menu:\n  home: /\n  about: /about/\n',
      );

      const config = await loadThemeConfig(themeDir);
      expect(config.menu).toBeDefined();
      expect((config.menu as Record<string, string>).home).toBe('/');
    });

    it('should load _config.yml as fallback', async () => {
      const themeDir = nodePath.join(tmpDir, 'my-theme');
      await fs.mkdir(themeDir, { recursive: true });
      await fs.writeFile(
        nodePath.join(themeDir, '_config.yml'),
        'sidebar: true\n',
      );

      const config = await loadThemeConfig(themeDir);
      expect(config.sidebar).toBe(true);
    });

    it('should return empty object if no config file', async () => {
      const config = await loadThemeConfig(tmpDir);
      expect(config).toEqual({});
    });

    it('should prefer _config.yaml over _config.yml', async () => {
      const themeDir = nodePath.join(tmpDir, 'my-theme');
      await fs.mkdir(themeDir, { recursive: true });
      await fs.writeFile(nodePath.join(themeDir, '_config.yaml'), 'source: yaml\n');
      await fs.writeFile(nodePath.join(themeDir, '_config.yml'), 'source: yml\n');

      const config = await loadThemeConfig(themeDir);
      expect(config.source).toBe('yaml');
    });
  });

  // ── loadThemeAssets ──────────────────────────────────────────────────────

  describe('loadThemeAssets', () => {
    it('should list source assets', async () => {
      const sourceDir = nodePath.join(tmpDir, 'source');
      await fs.mkdir(nodePath.join(sourceDir, 'css'), { recursive: true });
      await fs.writeFile(nodePath.join(sourceDir, 'css/style.css'), 'body{}');
      await fs.writeFile(nodePath.join(sourceDir, 'favicon.ico'), '');

      const assets = await loadThemeAssets(sourceDir);
      const paths = assets.map(a => a.path).sort();
      expect(paths).toEqual(['css/style.css', 'favicon.ico']);
    });

    it('should skip hidden files', async () => {
      const sourceDir = nodePath.join(tmpDir, 'source');
      await fs.mkdir(sourceDir, { recursive: true });
      await fs.writeFile(nodePath.join(sourceDir, '.DS_Store'), '');
      await fs.writeFile(nodePath.join(sourceDir, 'main.js'), '');

      const assets = await loadThemeAssets(sourceDir);
      expect(assets).toHaveLength(1);
      expect(assets[0]!.path).toBe('main.js');
    });

    it('should return empty for non-existent dir', async () => {
      const assets = await loadThemeAssets(nodePath.join(tmpDir, 'nope'));
      expect(assets).toEqual([]);
    });
  });

  // ── loadLanguages ────────────────────────────────────────────────────────

  describe('loadLanguages', () => {
    it('should load YAML language files', async () => {
      const langDir = nodePath.join(tmpDir, 'languages');
      await fs.mkdir(langDir, { recursive: true });
      await fs.writeFile(nodePath.join(langDir, 'en.yaml'), 'greeting: Hello\n');
      await fs.writeFile(nodePath.join(langDir, 'zh.yaml'), 'greeting: 你好\n');

      const languages = await loadLanguages(langDir);
      expect(Object.keys(languages)).toEqual(expect.arrayContaining(['en', 'zh']));
      expect(languages.en!.greeting).toBe('Hello');
      expect(languages.zh!.greeting).toBe('你好');
    });

    it('should load JSON language files', async () => {
      const langDir = nodePath.join(tmpDir, 'languages');
      await fs.mkdir(langDir, { recursive: true });
      await fs.writeFile(
        nodePath.join(langDir, 'fr.json'),
        JSON.stringify({ greeting: 'Bonjour' }),
      );

      const languages = await loadLanguages(langDir);
      expect(languages.fr!.greeting).toBe('Bonjour');
    });

    it('should return empty for non-existent dir', async () => {
      const languages = await loadLanguages(nodePath.join(tmpDir, 'nope'));
      expect(languages).toEqual({});
    });

    it('should skip non-language files', async () => {
      const langDir = nodePath.join(tmpDir, 'languages');
      await fs.mkdir(langDir, { recursive: true });
      await fs.writeFile(nodePath.join(langDir, 'readme.md'), '# Languages');
      await fs.writeFile(nodePath.join(langDir, 'en.yaml'), 'hello: world\n');

      const languages = await loadLanguages(langDir);
      expect(Object.keys(languages)).toEqual(['en']);
    });
  });
});
