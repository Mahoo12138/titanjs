/**
 * @neo-hexo/cli — Config Loader
 *
 * Finds and loads `neo-hexo.yaml` from the project root.
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { YamlConfig } from '@neo-hexo/core';

/** Default config file names to search for, in priority order. */
const CONFIG_FILES = [
  'neo-hexo.yaml',
  'neo-hexo.yml',
  '_config.yaml',
  '_config.yml',
];

/**
 * Find the config file path in a directory.
 * Searches for known config file names in priority order.
 */
export async function findConfigFile(
  baseDir: string,
  explicitPath?: string,
): Promise<string | null> {
  // If an explicit path was provided, use it directly
  if (explicitPath) {
    const resolved = nodePath.resolve(baseDir, explicitPath);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      return null;
    }
  }

  // Search for default config files
  for (const name of CONFIG_FILES) {
    const filePath = nodePath.join(baseDir, name);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // Try next
    }
  }

  return null;
}

/**
 * Load and parse a YAML config file.
 * Returns null if the file doesn't exist.
 */
export async function loadConfigFile(
  configPath: string,
): Promise<YamlConfig> {
  const raw = await fs.readFile(configPath, 'utf-8');
  const parsed = parseYaml(raw);

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config file: expected a YAML mapping, got ${typeof parsed}`);
  }

  return parsed as YamlConfig;
}

/**
 * Find and load config from a directory.
 * Returns { config, configPath } or null if no config found.
 */
export async function loadConfig(
  baseDir: string,
  explicitPath?: string,
): Promise<{ config: YamlConfig; configPath: string } | null> {
  const configPath = await findConfigFile(baseDir, explicitPath);
  if (!configPath) return null;

  const config = await loadConfigFile(configPath);
  return { config, configPath };
}
