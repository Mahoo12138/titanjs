import { describe, it, expect, beforeEach } from 'vitest';
import { I18n, normalizeLang } from '../src/index.js';

describe('@neo-hexo/i18n', () => {
  // ── normalizeLang ──

  describe('normalizeLang', () => {
    it('lowercases and normalizes', () => {
      expect(normalizeLang('en-US')).toBe('en-us');
      expect(normalizeLang('zh_CN')).toBe('zh-cn');
      expect(normalizeLang('EN')).toBe('en');
    });
  });

  // ── I18n ──

  describe('I18n', () => {
    let i18n: I18n;

    beforeEach(() => {
      i18n = new I18n();
      i18n.set('en', {
        greeting: 'Hello, %s!',
        farewell: 'Goodbye, %s.',
        posts: { one: '%d post', other: '%d posts' },
        nav: { home: 'Home', about: 'About' },
        count: '%d items at %s',
      });
      i18n.set('zh-CN', {
        greeting: '你好，%s！',
        farewell: '再见，%s。',
        posts: '%d 篇文章',
        nav: { home: '首页', about: '关于' },
      });
    });

    it('creates a translator for a language', () => {
      const t = i18n.translator('en');
      expect(t('greeting', 'World')).toBe('Hello, World!');
    });

    it('handles string interpolation with %s', () => {
      const t = i18n.translator('en');
      expect(t('farewell', 'Alice')).toBe('Goodbye, Alice.');
    });

    it('handles multiple arguments', () => {
      const t = i18n.translator('en');
      expect(t('count', 5, 'home')).toBe('5 items at home');
    });

    it('handles plural forms (English)', () => {
      const t = i18n.translator('en');
      expect(t('posts', 1)).toBe('1 post');
      expect(t('posts', 5)).toBe('5 posts');
    });

    it('falls back to fallback language', () => {
      const t = i18n.translator('zh-CN');
      // 'count' doesn't exist in zh-CN, should fall back to en
      expect(t('count', 3, 'page')).toBe('3 items at page');
    });

    it('returns key as-is when not found in any language', () => {
      const t = i18n.translator('en');
      expect(t('unknown.key')).toBe('unknown.key');
    });

    it('resolves nested keys with dot notation', () => {
      const t = i18n.translator('en');
      expect(t('nav.home')).toBe('Home');
      expect(t('nav.about')).toBe('About');
    });

    it('resolves nested keys in other languages', () => {
      const t = i18n.translator('zh-CN');
      expect(t('nav.home')).toBe('首页');
    });

    it('lists registered languages', () => {
      const langs = i18n.list();
      expect(langs).toContain('en');
      expect(langs).toContain('zh-cn');
    });

    it('removes a language', () => {
      i18n.remove('zh-CN');
      expect(i18n.list()).not.toContain('zh-cn');
    });

    it('merges language data', () => {
      i18n.set('en', { extra: 'Extra text' });
      const t = i18n.translator('en');
      expect(t('greeting', 'World')).toBe('Hello, World!');
      expect(t('extra')).toBe('Extra text');
    });

    it('set fallback language', () => {
      i18n.setFallback('zh-CN');
      const t = i18n.translator('fr'); // French not registered
      expect(t('greeting', 'World')).toBe('你好，World！');
    });

    it('handles non-plural string for %d', () => {
      // zh-CN has posts as a plain string, not plural entry
      const t = i18n.translator('zh-CN');
      expect(t('posts', 3)).toBe('3 篇文章');
    });
  });
});
