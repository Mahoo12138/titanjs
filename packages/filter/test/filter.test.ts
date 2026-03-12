/**
 * @neo-hexo/filter — Tests
 */

import { describe, it, expect } from 'vitest';
import {
  externalLinkFilter,
  titlecaseFilter,
  excerptFilter,
  metaGeneratorFilter,
} from '@neo-hexo/filter';
import type { PostData } from '@neo-hexo/core';

// ─── Helper ──────────────────────────────────────────────────────────────────

function makePost(overrides: Partial<PostData> = {}): PostData {
  return {
    path: 'test.md',
    raw: '',
    content: '',
    frontMatter: {},
    excerpt: '',
    published: true,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('@neo-hexo/filter', () => {
  describe('externalLinkFilter', () => {
    it('should add target=_blank to external links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = externalLinkFilter(html, 'https://mysite.com');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener"');
    });

    it('should not modify internal links', () => {
      const html = '<a href="https://mysite.com/about">About</a>';
      const result = externalLinkFilter(html, 'https://mysite.com');
      expect(result).not.toContain('target=');
    });

    it('should not add target if already present', () => {
      const html = '<a href="https://example.com" target="_self">Link</a>';
      const result = externalLinkFilter(html, 'https://mysite.com');
      expect(result).toContain('target="_self"');
      expect(result).not.toContain('target="_blank"');
    });

    it('should handle links without site URL', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = externalLinkFilter(html);
      expect(result).toContain('target="_blank"');
    });
  });

  describe('titlecaseFilter', () => {
    it('should capitalize major words', () => {
      expect(titlecaseFilter('hello world')).toBe('Hello World');
    });

    it('should keep minor words lowercase (except first)', () => {
      expect(titlecaseFilter('the lord of the rings')).toBe('The Lord of the Rings');
    });
  });

  describe('excerptFilter', () => {
    it('should extract excerpt from <!-- more --> marker', () => {
      const post = makePost({ content: 'First part<!-- more -->Second part' });
      const result = excerptFilter(post);
      expect(result.excerpt).toBe('First part');
    });

    it('should not override existing excerpt', () => {
      const post = makePost({
        content: 'First<!-- more -->Second',
        excerpt: 'Existing',
      });
      const result = excerptFilter(post);
      expect(result.excerpt).toBe('Existing');
    });

    it('should return original if no marker found', () => {
      const post = makePost({ content: 'No marker here' });
      const result = excerptFilter(post);
      expect(result.excerpt).toBe('');
    });
  });

  describe('metaGeneratorFilter', () => {
    it('should inject meta generator tag', () => {
      const html = '<html><head></head><body></body></html>';
      const result = metaGeneratorFilter(html);
      expect(result).toContain('name="generator"');
      expect(result).toContain('Neo-Hexo');
    });

    it('should not duplicate if already present', () => {
      const html = '<html><head><meta name="generator" content="Other"></head></html>';
      const result = metaGeneratorFilter(html);
      expect(result).toBe(html);
    });
  });
});
