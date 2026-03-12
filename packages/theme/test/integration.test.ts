/**
 * Tests for @neo-hexo/theme — plugin integration with NeoHexo
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { NeoHexo, type View, RenderServiceKey } from '@neo-hexo/core';
import themePlugin from '../src/index.js';

describe('Theme Plugin Integration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'neo-hexo-theme-int-'));

    // Create minimal project structure
    await fs.mkdir(nodePath.join(tmpDir, 'source'), { recursive: true });
    await fs.mkdir(nodePath.join(tmpDir, 'scaffolds'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should load theme views into ViewRegistry on init', async () => {
    // Create theme layout directory with templates
    const layoutDir = nodePath.join(tmpDir, 'theme/layout');
    await fs.mkdir(layoutDir, { recursive: true });
    await fs.writeFile(nodePath.join(layoutDir, 'post.html'), '<article>{{ page.title }}</article>');
    await fs.writeFile(nodePath.join(layoutDir, 'index.html'), '<main>{{ body }}</main>');

    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'theme' })],
    });
    await hexo.init();

    expect(hexo.views.has('post')).toBe(true);
    expect(hexo.views.has('index')).toBe(true);
    expect(hexo.views.size).toBe(2);

    await hexo.exit();
  });

  it('should load theme config and merge into site config', async () => {
    // Create theme with _config.yaml
    const themeDir = nodePath.join(tmpDir, 'theme');
    await fs.mkdir(themeDir, { recursive: true });
    await fs.writeFile(
      nodePath.join(themeDir, '_config.yaml'),
      'menu:\n  home: /\n  about: /about/\nsidebar: true\n',
    );

    // Create layout dir (required)
    await fs.mkdir(nodePath.join(themeDir, 'layout'), { recursive: true });

    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'theme' })],
    });
    await hexo.init();

    // Theme config should be merged into config.theme
    const themeConfig = hexo.config.theme as Record<string, unknown>;
    expect(themeConfig).toBeDefined();
    expect(themeConfig.sidebar).toBe(true);

    await hexo.exit();
  });

  it('should load i18n language files', async () => {
    // Create theme with languages
    const themeDir = nodePath.join(tmpDir, 'theme');
    const langDir = nodePath.join(themeDir, 'languages');
    await fs.mkdir(langDir, { recursive: true });
    await fs.mkdir(nodePath.join(themeDir, 'layout'), { recursive: true });
    await fs.writeFile(nodePath.join(langDir, 'en.yaml'), 'greeting: Hello\n');

    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'theme' })],
    });
    await hexo.init();

    // Languages should be attached to config
    const langs = (hexo.config as Record<string, unknown>).__themeLanguages as Record<string, unknown>;
    expect(langs).toBeDefined();
    expect((langs.en as Record<string, unknown>).greeting).toBe('Hello');

    await hexo.exit();
  });

  it('should resolve views via layout fallback', async () => {
    const layoutDir = nodePath.join(tmpDir, 'theme/layout');
    await fs.mkdir(layoutDir, { recursive: true });
    // Only provide 'index' view, not 'post' or 'page'
    await fs.writeFile(nodePath.join(layoutDir, 'index.html'), '<main>content</main>');

    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'theme' })],
    });
    await hexo.init();

    // Try resolving ['post', 'page', 'index'] — should fall back to index
    const view = hexo.views.resolve(['post', 'page', 'index']);
    expect(view).toBeDefined();
    expect(view!.name).toBe('index');

    await hexo.exit();
  });

  it('should handle missing theme directory gracefully', async () => {
    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'nonexistent-theme' })],
    });
    await hexo.init();

    // Should work fine with zero views
    expect(hexo.views.size).toBe(0);

    await hexo.exit();
  });

  it('should clear views on dispose', async () => {
    const layoutDir = nodePath.join(tmpDir, 'theme/layout');
    await fs.mkdir(layoutDir, { recursive: true });
    await fs.writeFile(nodePath.join(layoutDir, 'post.html'), '<article/>');

    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'theme' })],
    });
    await hexo.init();
    expect(hexo.views.size).toBe(1);

    await hexo.exit();
    expect(hexo.views.size).toBe(0);
  });

  it('should render views using the render pipeline', async () => {
    const layoutDir = nodePath.join(tmpDir, 'theme/layout');
    await fs.mkdir(layoutDir, { recursive: true });
    await fs.writeFile(nodePath.join(layoutDir, 'post.txt'), 'Title: RENDERED');

    // Register a simple txt passthrough renderer
    const hexo = new NeoHexo(tmpDir, {
      plugins: [
        {
          name: 'test-txt-renderer',
          enforce: 'pre' as const,
          apply(ctx) {
            const pipeline = ctx.inject(RenderServiceKey);
            pipeline.register({
              extensions: ['txt'],
              output: 'html',
              render(source) {
                return `<html>${source}</html>`;
              },
            });
          },
        },
        themePlugin({ dir: 'theme' }),
      ],
    });
    await hexo.init();

    // The view should be loadable and renderable
    const view = hexo.views.get('post');
    expect(view).toBeDefined();

    const result = await view!.render({});
    expect(result).toContain('RENDERED');

    await hexo.exit();
  });

  it('should support custom theme directory via options', async () => {
    const layoutDir = nodePath.join(tmpDir, 'my-custom-theme/templates');
    await fs.mkdir(layoutDir, { recursive: true });
    await fs.writeFile(nodePath.join(layoutDir, 'page.html'), '<page/>');

    const hexo = new NeoHexo(tmpDir, {
      plugins: [themePlugin({ dir: 'my-custom-theme', layoutDir: 'templates' })],
    });
    await hexo.init();

    expect(hexo.views.has('page')).toBe(true);

    await hexo.exit();
  });
});
