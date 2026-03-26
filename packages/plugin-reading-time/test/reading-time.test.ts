import { describe, it, expect } from 'vitest'
import { pluginReadingTime, _estimateReadingTime, _stripHtml } from '../src/index.js'
import type { TransformContext } from '@titan/types'

describe('plugin-reading-time', () => {
  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginReadingTime()
    expect(plugin.name).toBe('@titan/plugin-reading-time')
    expect(plugin.hooks!['transform:entry']).toBeDefined()
  })

  describe('stripHtml', () => {
    it('should strip HTML tags', () => {
      expect(_stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
    })

    it('should strip HTML entities', () => {
      expect(_stripHtml('Hello&nbsp;world')).toBe('Hello world')
    })

    it('should handle empty string', () => {
      expect(_stripHtml('')).toBe('')
    })
  })

  describe('estimateReadingTime', () => {
    it('should estimate reading time for English text', () => {
      // 200 words at 200 WPM = 1 minute
      const words = Array(200).fill('word').join(' ')
      const result = _estimateReadingTime(words, {
        wordsPerMinute: 200,
        cjkCharactersPerMinute: 300,
        minTime: 1,
      })
      expect(result).toBe(1)
    })

    it('should estimate reading time for longer English text', () => {
      // 600 words at 200 WPM = 3 minutes
      const words = Array(600).fill('word').join(' ')
      const result = _estimateReadingTime(words, {
        wordsPerMinute: 200,
        cjkCharactersPerMinute: 300,
        minTime: 1,
      })
      expect(result).toBe(3)
    })

    it('should estimate reading time for CJK text', () => {
      // 300 CJK chars at 300 CPM = 1 minute
      const text = '中'.repeat(300)
      const result = _estimateReadingTime(text, {
        wordsPerMinute: 200,
        cjkCharactersPerMinute: 300,
        minTime: 1,
      })
      expect(result).toBe(1)
    })

    it('should handle mixed CJK and Latin text', () => {
      // 150 CJK chars + 100 Latin words
      // CJK: 150/300 = 0.5 min, Latin: 100/200 = 0.5 min → ceil(1.0) = 1
      const text = '中'.repeat(150) + ' ' + Array(100).fill('word').join(' ')
      const result = _estimateReadingTime(text, {
        wordsPerMinute: 200,
        cjkCharactersPerMinute: 300,
        minTime: 1,
      })
      expect(result).toBe(1)
    })

    it('should enforce minimum reading time', () => {
      const result = _estimateReadingTime('short', {
        wordsPerMinute: 200,
        cjkCharactersPerMinute: 300,
        minTime: 1,
      })
      expect(result).toBe(1)
    })

    it('should respect custom minTime', () => {
      const result = _estimateReadingTime('short', {
        wordsPerMinute: 200,
        cjkCharactersPerMinute: 300,
        minTime: 2,
      })
      expect(result).toBe(2)
    })
  })

  describe('transform:entry hook', () => {
    it('should set readingTime on entry', async () => {
      const plugin = pluginReadingTime({ wordsPerMinute: 200 })
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<p>' + Array(400).fill('word').join(' ') + '</p>',
        assets: [],
      }

      await plugin.hooks!['transform:entry']!(ctx, async () => {})

      expect(entry.readingTime).toBe(2) // 400 words / 200 WPM = 2 min
    })

    it('should call next()', async () => {
      const plugin = pluginReadingTime()
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<p>Hello</p>',
        assets: [],
      }

      let nextCalled = false
      await plugin.hooks!['transform:entry']!(ctx, async () => { nextCalled = true })

      expect(nextCalled).toBe(true)
    })

    it('should handle CJK content', async () => {
      const plugin = pluginReadingTime({ cjkCharactersPerMinute: 300 })
      const entry: any = { id: 'test', slug: 'test', title: 'Test' }
      const ctx: TransformContext = {
        entry,
        html: '<p>' + '中'.repeat(600) + '</p>',
        assets: [],
      }

      await plugin.hooks!['transform:entry']!(ctx, async () => {})

      expect(entry.readingTime).toBe(2) // 600 chars / 300 CPM = 2 min
    })
  })
})
