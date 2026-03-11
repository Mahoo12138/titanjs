import { describe, it, expect } from 'vitest';
import { parse, stringify } from '../src/index.js';

describe('@neo-hexo/front-matter', () => {
  // ── YAML ──

  describe('parse YAML', () => {
    it('parses basic YAML front-matter', () => {
      const input = `---
title: Hello World
date: 2024-01-15
---

This is the content.`;

      const result = parse(input);
      expect(result.data.title).toBe('Hello World');
      expect(result.data.date).toBe('2024-01-15');
      expect(result.content).toBe('This is the content.');
    });

    it('parses arrays in YAML', () => {
      const input = `---
title: Test
tags:
  - javascript
  - typescript
---

Content here.`;

      const result = parse(input);
      expect(result.data.tags).toEqual(['javascript', 'typescript']);
    });

    it('parses booleans and numbers', () => {
      const input = `---
published: true
count: 42
ratio: 3.14
---

Body.`;

      const result = parse(input);
      expect(result.data.published).toBe(true);
      expect(result.data.count).toBe(42);
      expect(result.data.ratio).toBe(3.14);
    });

    it('handles quoted strings', () => {
      const input = `---
title: 'Hello: World'
---

Content.`;

      const result = parse(input);
      expect(result.data.title).toBe('Hello: World');
    });
  });

  // ── Excerpt ──

  describe('excerpt', () => {
    it('extracts excerpt before <!-- more --> marker', () => {
      const input = `---
title: Test
---

This is the excerpt.

<!-- more -->

This is after the fold.`;

      const result = parse(input);
      expect(result.excerpt).toBe('This is the excerpt.');
      expect(result.content).toContain('<!-- more -->');
      expect(result.content).toContain('This is after the fold.');
    });

    it('returns empty excerpt when no marker', () => {
      const input = `---
title: Test
---

No excerpt here.`;

      const result = parse(input);
      expect(result.excerpt).toBe('');
    });

    it('supports custom excerpt separator', () => {
      const input = `---
title: Test
---

Excerpt part.

---BREAK---

Rest of content.`;

      const result = parse(input, { excerptSeparator: '---BREAK---' });
      expect(result.excerpt).toBe('Excerpt part.');
    });
  });

  // ── JSON ──

  describe('parse JSON', () => {
    it('parses JSON front-matter', () => {
      const input = `;;;
{"title": "Hello", "date": "2024-01-15"}
;;;

JSON content.`;

      const result = parse(input);
      expect(result.data.title).toBe('Hello');
      expect(result.content).toBe('JSON content.');
    });
  });

  // ── TOML ──

  describe('parse TOML', () => {
    it('parses simple TOML front-matter', () => {
      const input = `+++
title = "TOML Post"
draft = false
count = 5
+++

TOML content.`;

      const result = parse(input);
      expect(result.data.title).toBe('TOML Post');
      expect(result.data.draft).toBe(false);
      expect(result.data.count).toBe(5);
    });
  });

  // ── No front-matter ──

  describe('no front-matter', () => {
    it('returns empty data for plain content', () => {
      const input = 'Just some content without front-matter.';
      const result = parse(input);
      expect(result.data).toEqual({});
      expect(result.content).toBe(input);
      expect(result.raw).toBe('');
    });
  });

  // ── Stringify ──

  describe('stringify', () => {
    it('stringifies YAML front-matter', () => {
      const result = stringify(
        { title: 'Hello', published: true },
        'Content here.',
      );

      expect(result).toContain('---');
      expect(result).toContain('title: Hello');
      expect(result).toContain('published: true');
      expect(result).toContain('Content here.');
    });

    it('stringifies JSON front-matter', () => {
      const result = stringify(
        { title: 'JSON' },
        'Content.',
        'json',
      );

      expect(result).toContain(';;;');
      expect(result).toContain('"title": "JSON"');
    });

    it('handles arrays in stringify', () => {
      const result = stringify(
        { tags: ['a', 'b', 'c'] },
        'Content.',
      );

      expect(result).toContain('tags:');
      expect(result).toContain('  - a');
      expect(result).toContain('  - b');
    });
  });
});
