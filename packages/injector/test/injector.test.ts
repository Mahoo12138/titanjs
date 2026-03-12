/**
 * @neo-hexo/injector — Tests
 */

import { describe, it, expect } from 'vitest';
import injectorPlugin, { injectIntoHtml, type InjectorService } from '@neo-hexo/injector';
import { Context } from '@neo-hexo/core';
import { InjectorKey } from '@neo-hexo/injector';

describe('@neo-hexo/injector', () => {
  describe('plugin setup', () => {
    it('should register InjectorService in context', () => {
      const ctx = new Context();
      const plugin = injectorPlugin();
      plugin.apply!(ctx);

      const injector = ctx.inject(InjectorKey);
      expect(injector).toBeDefined();
      expect(typeof injector.add).toBe('function');
    });

    it('should add and retrieve entries', () => {
      const ctx = new Context();
      const plugin = injectorPlugin();
      plugin.apply!(ctx);

      const injector = ctx.inject(InjectorKey);
      injector.add('head_end', '<link rel="stylesheet" href="/a.css">');
      injector.add('body_end', '<script src="/app.js"></script>');

      expect(injector.get('head_end')).toHaveLength(1);
      expect(injector.get('body_end')).toHaveLength(1);
      expect(injector.text('head_end')).toContain('a.css');
    });

    it('should sort by priority', () => {
      const ctx = new Context();
      const plugin = injectorPlugin();
      plugin.apply!(ctx);

      const injector = ctx.inject(InjectorKey);
      injector.add('head_end', 'low', 1);
      injector.add('head_end', 'high', 10);

      const items = injector.get('head_end');
      expect(items[0]).toBe('high');
      expect(items[1]).toBe('low');
    });
  });

  describe('injectIntoHtml', () => {
    function createMockInjector(entries: Record<string, string[]>): InjectorService {
      return {
        add() {},
        get(point) {
          return entries[point] ?? [];
        },
        text(point) {
          return (entries[point] ?? []).join('\n');
        },
        clear() {},
      };
    }

    it('should inject into head_end', () => {
      const injector = createMockInjector({ head_end: ['<link rel="stylesheet">'] });
      const html = '<html><head></head><body></body></html>';
      const result = injectIntoHtml(html, injector);
      expect(result).toContain('<link rel="stylesheet">\n</head>');
    });

    it('should inject into body_end', () => {
      const injector = createMockInjector({ body_end: ['<script></script>'] });
      const html = '<html><head></head><body></body></html>';
      const result = injectIntoHtml(html, injector);
      expect(result).toContain('<script></script>\n</body>');
    });

    it('should inject into head_begin', () => {
      const injector = createMockInjector({ head_begin: ['<meta charset="utf-8">'] });
      const html = '<html><head></head><body></body></html>';
      const result = injectIntoHtml(html, injector);
      expect(result).toContain('<head>\n<meta charset="utf-8">');
    });

    it('should inject into body_begin', () => {
      const injector = createMockInjector({ body_begin: ['<nav>menu</nav>'] });
      const html = '<html><head></head><body></body></html>';
      const result = injectIntoHtml(html, injector);
      expect(result).toContain('<body>\n<nav>menu</nav>');
    });

    it('should not modify html when no entries', () => {
      const injector = createMockInjector({});
      const html = '<html><head></head><body></body></html>';
      const result = injectIntoHtml(html, injector);
      expect(result).toBe(html);
    });
  });
});
