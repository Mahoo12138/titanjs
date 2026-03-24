/*
 * @Author: mahoo12138 mahoo12138@qq.com
 * @Date: 2026-04-08 11:23:37
 * @LastEditors: mahoo12138 mahoo12138@qq.com
 * @LastEditTime: 2026-04-08 11:27:52
 * @FilePath: /titanjs/packages/core/src/config.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * Config - Load and validate titan.config.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { TitanConfig, UserConfig } from '@titan/types'

const DEFAULT_CONFIG: TitanConfig = {
  title: 'Titan Site',
  url: 'http://localhost:4000',
  language: 'en',
  source: 'source',
  build: {
    outDir: 'public',
    cacheDir: '.titan-cache',
    concurrency: 8,
  },
  markdown: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
  styles: {
    tokens: {},
  },
  plugins: [],
}

/**
 * Helper for users to define config with type hints
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config
}

/**
 * Load titan.config.ts from project root
 */
export async function loadConfig(rootDir: string): Promise<TitanConfig> {
  const configNames = ['titan.config.ts', 'titan.config.js', 'titan.config.mjs']

  for (const name of configNames) {
    const configPath = path.join(rootDir, name)
    if (await exists(configPath)) {
      const userConfig = await importConfig(configPath)
      return mergeConfig(DEFAULT_CONFIG, userConfig)
    }
  }

  return { ...DEFAULT_CONFIG }
}

async function importConfig(configPath: string): Promise<UserConfig> {
  const url = pathToFileURL(configPath).href
  const mod = await import(url)
  return mod.default ?? mod
}

function mergeConfig(defaults: TitanConfig, user: UserConfig): TitanConfig {
  return {
    title: user.title ?? defaults.title,
    url: user.url ?? defaults.url,
    language: user.language ?? defaults.language,
    source: user.source ?? defaults.source,
    build: {
      ...defaults.build,
      ...user.build,
    },
    markdown: {
      remarkPlugins: user.markdown?.remarkPlugins ?? defaults.markdown.remarkPlugins,
      rehypePlugins: user.markdown?.rehypePlugins ?? defaults.markdown.rehypePlugins,
      highlight: user.markdown?.highlight ?? defaults.markdown.highlight,
    },
    styles: {
      tokens: { ...defaults.styles.tokens, ...user.styles?.tokens },
      global: user.styles?.global ?? defaults.styles.global,
    },
    plugins: user.plugins ?? defaults.plugins,
    theme: user.theme ?? defaults.theme,
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}
