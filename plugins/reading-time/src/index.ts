/**
 * @titan/plugin-reading-time
 *
 * Estimates reading time for content entries.
 * Supports CJK and Latin text with configurable WPM.
 *
 * The core transformer already computes a basic readingTime,
 * but this plugin allows customization and recalculation.
 *
 * Usage:
 *   import readingTime from '@titan/plugin-reading-time'
 *   export default defineConfig({
 *     plugins: [readingTime({ wordsPerMinute: 250 })]
 *   })
 */
import type { PluginDefinition, TransformContext } from '@titan/types'
import { setEntryData } from '@titan/types'

export interface ReadingTimeOptions {
  /** Words per minute for Latin text (default: 200) */
  wordsPerMinute?: number
  /** Characters per minute for CJK text (default: 300) */
  cjkCharactersPerMinute?: number
  /** Minimum reading time in minutes (default: 1) */
  minTime?: number
}

// Declaration merging: register readingTime field on entries
declare module '@titan/types' {
  interface EntryExtensions {
    readingTime: number
  }
}

export function pluginReadingTime(options: ReadingTimeOptions = {}): PluginDefinition {
  const {
    wordsPerMinute = 200,
    cjkCharactersPerMinute = 300,
    minTime = 1,
  } = options

  return {
    name: '@titan/plugin-reading-time',

    produces: ['post.readingTime'],

    hooks: {
      'transform:entry': async (ctx: TransformContext, next) => {
        await next()

        // Only compute for content types that have text
        const text = stripHtml(ctx.html)
        const minutes = estimateReadingTime(text, {
          wordsPerMinute,
          cjkCharactersPerMinute,
          minTime,
        })

        // Update entry's readingTime
        setEntryData(ctx.entry, 'readingTime', minutes)
      },
    },
  }
}

/**
 * Strip HTML tags to get plain text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Estimate reading time in minutes.
 * Handles mixed CJK/Latin content.
 */
function estimateReadingTime(
  text: string,
  options: Required<ReadingTimeOptions>,
): number {
  // Count CJK characters (Chinese, Japanese, Korean)
  const cjkRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g
  const cjkChars = (text.match(cjkRegex) || []).length

  // Remove CJK characters and count Latin words
  const latinText = text.replace(cjkRegex, ' ')
  const latinWords = latinText.split(/\s+/).filter(w => w.length > 0).length

  // Calculate time for each portion
  const cjkMinutes = cjkChars / options.cjkCharactersPerMinute
  const latinMinutes = latinWords / options.wordsPerMinute

  const total = Math.ceil(cjkMinutes + latinMinutes)
  return Math.max(options.minTime, total)
}

// Export the estimator for testing
export { estimateReadingTime as _estimateReadingTime, stripHtml as _stripHtml }

export default pluginReadingTime
