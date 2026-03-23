/**
 * Loader - Read source files and produce LoadContext entries
 *
 * Responsibilities:
 * - Scan source directories for Markdown files
 * - Parse frontmatter with gray-matter
 * - Determine content type from directory structure
 * - Collect file metadata
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import type { LoadContext } from '@titan/types'

export interface LoaderOptions {
  /** Source root directory (absolute) */
  sourceDir: string
  /** Content type mappings: directory name -> content type */
  contentTypes?: Record<string, string>
}

const DEFAULT_CONTENT_TYPES: Record<string, string> = {
  _posts: 'post',
  _pages: 'page',
}

/**
 * Scan source directory and load all Markdown files
 */
export async function loadSourceFiles(options: LoaderOptions): Promise<LoadContext[]> {
  const { sourceDir, contentTypes = DEFAULT_CONTENT_TYPES } = options
  const contexts: LoadContext[] = []

  for (const [dirName, contentType] of Object.entries(contentTypes)) {
    const dirPath = path.join(sourceDir, dirName)

    if (!await exists(dirPath)) continue

    const files = await scanMarkdownFiles(dirPath)
    for (const filePath of files) {
      const ctx = await loadFile(filePath, contentType)
      contexts.push(ctx)
    }
  }

  return contexts
}

/**
 * Load a single Markdown file into a LoadContext
 */
export async function loadFile(filePath: string, contentType: string): Promise<LoadContext> {
  const rawContent = await fs.readFile(filePath, 'utf-8')
  const { data: frontmatter, content: body } = matter(rawContent)

  return {
    filePath,
    rawContent,
    frontmatter,
    contentType,
    body,
  }
}

/**
 * Recursively scan a directory for .md files
 */
async function scanMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await scanMarkdownFiles(fullPath)
      results.push(...nested)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath)
    }
  }

  return results.sort()
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
