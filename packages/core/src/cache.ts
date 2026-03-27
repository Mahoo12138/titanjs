/**
 * Cache - File system JSON cache with content-addressed hashing
 *
 * Structure:
 *   .titan-cache/
 *   ├── manifest.json     # { filePath → contentHash }
 *   └── entries/
 *       ├── <hash>.json   # Serialized entry data
 *       └── ...
 *
 * Write strategy: write to .tmp then atomic rename to avoid corruption
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import type { BaseEntry } from '@titan/types'

export interface CacheManifest {
  [filePath: string]: string   // filePath → content hash
}

export class FileSystemCache {
  private cacheDir: string
  private entriesDir: string
  private manifestPath: string
  private manifest: CacheManifest = {}
  private pipelineHash: string = ''

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
    this.entriesDir = path.join(cacheDir, 'entries')
    this.manifestPath = path.join(cacheDir, 'manifest.json')
  }

  /**
   * Set the pipeline hash (hash of remarkPlugins / rehypePlugins).
   * If the pipeline changed since last run, all cached entries are invalidated.
   */
  setPipelineHash(hash: string): void {
    this.pipelineHash = hash
    const stored = this.manifest['_pipeline'] ?? ''
    if (stored !== hash) {
      // Pipeline changed — drop all file entries but keep _pipeline key
      this.manifest = { '_pipeline': hash }
    }
  }

  /**
   * Initialize cache directory and load manifest
   */
  async init(): Promise<void> {
    await fs.mkdir(this.entriesDir, { recursive: true })

    try {
      const data = await fs.readFile(this.manifestPath, 'utf-8')
      this.manifest = JSON.parse(data)
    } catch {
      this.manifest = {}
    }
  }

  /**
   * Check if a file's cache is still valid
   */
  async isValid(filePath: string): Promise<boolean> {
    const currentHash = await this.hashFile(filePath)
    return this.manifest[filePath] === currentHash
  }

  /**
   * Get cached entry data
   */
  async get(filePath: string): Promise<BaseEntry | null> {
    const hash = this.manifest[filePath]
    if (!hash) return null

    try {
      const entryPath = path.join(this.entriesDir, `${hash}.json`)
      const data = await fs.readFile(entryPath, 'utf-8')
      return reviveEntry(JSON.parse(data))
    } catch {
      return null
    }
  }

  /**
   * Store entry data in cache (atomic write)
   */
  async set(filePath: string, entry: BaseEntry): Promise<void> {
    const hash = await this.hashFile(filePath)

    // Atomic write: tmp file → rename
    const entryPath = path.join(this.entriesDir, `${hash}.json`)
    const tmpPath = `${entryPath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(entry), 'utf-8')
    await fs.rename(tmpPath, entryPath)

    // Update manifest (always persist pipeline hash alongside file entries)
    this.manifest[filePath] = hash
    if (this.pipelineHash) this.manifest['_pipeline'] = this.pipelineHash
  }

  /**
   * Persist manifest to disk
   */
  async saveManifest(): Promise<void> {
    const tmpPath = `${this.manifestPath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(this.manifest, null, 2), 'utf-8')
    await fs.rename(tmpPath, this.manifestPath)
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    await fs.rm(this.cacheDir, { recursive: true, force: true })
    this.manifest = {}
  }

  /**
   * Hash a file's content (SHA-256, first 16 hex chars)
   */
  private async hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath)
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }
}

/**
 * Revive Date objects from JSON parsing
 */
function reviveEntry(data: any): BaseEntry {
  if (data.date) data.date = new Date(data.date)
  if (data.updated) data.updated = new Date(data.updated)
  return data as BaseEntry
}
