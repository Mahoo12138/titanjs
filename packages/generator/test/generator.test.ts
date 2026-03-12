/**
 * @neo-hexo/generator — Tests
 */

import { describe, it, expect } from 'vitest';
import {
  generatePostRoutes,
  generatePageRoutes,
} from '@neo-hexo/generator';
import type { PostData } from '@neo-hexo/core';

function makePost(overrides: Partial<PostData> = {}): PostData {
  return {
    path: 'test.md',
    raw: '',
    content: '<p>Hello</p>',
    frontMatter: {
      title: 'Test Post',
      date: '2024-01-15',
      slug: 'test-post',
    },
    excerpt: '',
    published: true,
    ...overrides,
  };
}

describe('@neo-hexo/generator', () => {
  describe('generatePostRoutes', () => {
    it('should generate routes for published posts', () => {
      const posts = [
        makePost({ frontMatter: { title: 'Post A', date: '2024-01-10', slug: 'post-a' } }),
        makePost({ frontMatter: { title: 'Post B', date: '2024-01-20', slug: 'post-b' } }),
      ];

      const routes = generatePostRoutes(posts, ':year/:month/:day/:title/');
      expect(routes).toHaveLength(2);
      // Sorted by date descending
      expect(routes[0]!.path).toBe('2024/01/20/post-b/');
      expect(routes[1]!.path).toBe('2024/01/10/post-a/');
    });

    it('should skip unpublished posts', () => {
      const posts = [
        makePost({ published: true }),
        makePost({ published: false }),
      ];
      const routes = generatePostRoutes(posts, ':year/:month/:day/:title/');
      expect(routes).toHaveLength(1);
    });

    it('should include prev/next navigation', () => {
      const posts = [
        makePost({ frontMatter: { title: 'A', date: '2024-01-01', slug: 'a' } }),
        makePost({ frontMatter: { title: 'B', date: '2024-01-02', slug: 'b' } }),
        makePost({ frontMatter: { title: 'C', date: '2024-01-03', slug: 'c' } }),
      ];
      const routes = generatePostRoutes(posts, ':year/:month/:day/:title/');

      // Newest first: C, B, A
      expect((routes[0]!.data as Record<string, unknown>).prev).toBeNull();
      expect((routes[0]!.data as Record<string, unknown>).next).not.toBeNull();
      expect((routes[2]!.data as Record<string, unknown>).next).toBeNull();
    });
  });

  describe('generatePageRoutes', () => {
    it('should generate page routes', () => {
      const pages = [
        makePost({ path: 'about.md' }),
        makePost({ path: 'contact.md' }),
      ];
      const routes = generatePageRoutes(pages);
      expect(routes).toHaveLength(2);
      expect(routes[0]!.path).toBe('about.html');
      expect(routes[1]!.path).toBe('contact.html');
    });

    it('should strip _pages prefix', () => {
      const pages = [makePost({ path: '_pages/about.md' })];
      const routes = generatePageRoutes(pages);
      expect(routes[0]!.path).toBe('about.html');
    });
  });
});
