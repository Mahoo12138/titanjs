/**
 * @neo-hexo/cli — Plugin Resolver
 *
 * Maps plugin names from `neo-hexo.yaml` to plugin factory functions.
 * Supports:
 *   1. Built-in shorthand names (e.g., 'renderer-markdown' → @neo-hexo/renderer-markdown)
 *   2. Scoped package names (e.g., '@neo-hexo/highlight')
 *   3. Bare npm package names (e.g., 'neo-hexo-plugin-foo')
 */

import * as nodePath from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { NeoHexoPlugin, PluginResolver } from '@neo-hexo/core';

// ─── Built-in Plugin Map ─────────────────────────────────────────────────────

/**
 * Maps shorthand names to their package specifiers.
 * These are the official @neo-hexo/* plugin packages.
 */
const BUILTIN_PLUGINS: Record<string, string> = {
  'renderer-markdown': '@neo-hexo/renderer-markdown',
  'renderer-edge': '@neo-hexo/renderer-edge',
  'processor': '@neo-hexo/processor',
  'generator': '@neo-hexo/generator',
  'filter': '@neo-hexo/filter',
  'helper': '@neo-hexo/helper',
  'highlight': '@neo-hexo/highlight',
  'injector': '@neo-hexo/injector',
  'console': '@neo-hexo/console',
  'deployer-git': '@neo-hexo/deployer-git',
  'theme': '@neo-hexo/theme',
  'server': '@neo-hexo/server',
};

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Resolve a plugin name to its package specifier.
 *
 *   'renderer-markdown'           → '@neo-hexo/renderer-markdown'
 *   '@neo-hexo/highlight'         → '@neo-hexo/highlight'
 *   'neo-hexo-plugin-foo'         → 'neo-hexo-plugin-foo'
 */
function resolvePluginSpecifier(name: string): string {
  // Already a scoped or absolute package name
  if (name.startsWith('@') || name.startsWith('.') || name.startsWith('/')) {
    return name;
  }

  // Check built-in shorthand map
  if (name in BUILTIN_PLUGINS) {
    return BUILTIN_PLUGINS[name]!;
  }

  // Assume it's an npm package name
  return name;
}

// ─── Module Resolution Helpers ───────────────────────────────────────────────

/**
 * Extract the ESM entry point from a package.json object.
 * Supports: exports['.'].import, exports['.'].default, exports (string), main.
 */
function getPackageEntry(pkg: Record<string, unknown>): string {
  const exports = pkg.exports;
  if (typeof exports === 'string') return exports;
  if (exports && typeof exports === 'object') {
    const root = (exports as Record<string, unknown>)['.'];
    if (typeof root === 'string') return root;
    if (root && typeof root === 'object') {
      const exp = root as Record<string, string>;
      return exp.import ?? exp.default ?? (pkg.main as string) ?? 'index.js';
    }
  }
  return (pkg.main as string) ?? 'index.js';
}

/**
 * Try reading a package's entry point from a candidate directory.
 * Returns the resolved file URL or null.
 */
async function tryResolvePackageAt(
  specifier: string,
  parentDir: string,
): Promise<string | null> {
  const pkgJsonPath = nodePath.join(parentDir, 'node_modules', specifier, 'package.json');
  try {
    const raw = await readFile(pkgJsonPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const entry = getPackageEntry(pkg);
    const resolved = nodePath.resolve(parentDir, 'node_modules', specifier, entry);
    return pathToFileURL(resolved).href;
  } catch {
    return null;
  }
}

/**
 * Resolve a module specifier from the project's dependency tree.
 *
 * Strategy:
 *  1. Check `baseDir/node_modules/<specifier>` (direct dep of project)
 *  2. Walk up from baseDir to root checking `node_modules/<specifier>` (hoisted deps)
 *  3. Check each direct dep's `node_modules/<specifier>` (transitive deps via meta package)
 */
async function resolveFromProject(specifier: string, baseDir: string): Promise<string> {
  // 1. Walk up from baseDir checking node_modules at each level
  let current = baseDir;
  const visited = new Set<string>();
  while (true) {
    const normalized = nodePath.resolve(current);
    if (visited.has(normalized)) break;
    visited.add(normalized);

    const resolved = await tryResolvePackageAt(specifier, current);
    if (resolved) return resolved;

    const parent = nodePath.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // 2. Check inside each direct dependency's node_modules (handles pnpm strict isolation)
  const nodeModulesDir = nodePath.join(baseDir, 'node_modules');
  try {
    const entries = await readdir(nodeModulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.name.startsWith('@')) {
        // Scoped package — list its sub-entries
        const scopeDir = nodePath.join(nodeModulesDir, entry.name);
        const scopeEntries = await readdir(scopeDir, { withFileTypes: true }).catch(() => []);
        for (const scopeEntry of scopeEntries) {
          const depDir = nodePath.join(nodeModulesDir, entry.name, scopeEntry.name);
          const resolved = await tryResolvePackageAt(specifier, depDir);
          if (resolved) return resolved;
        }
      } else {
        const depDir = nodePath.join(nodeModulesDir, entry.name);
        const resolved = await tryResolvePackageAt(specifier, depDir);
        if (resolved) return resolved;
      }
    }
  } catch {
    // node_modules dir doesn't exist
  }

  throw new Error(`Cannot resolve '${specifier}' from '${baseDir}'`);
}

// ─── Plugin Resolver ─────────────────────────────────────────────────────────

/**
 * Create the default plugin resolver.
 *
 * @param baseDir — Project root directory. When provided, enables fallback
 *   resolution from the project's dependency tree. This is required for pnpm
 *   workspaces where strict isolation prevents bare `import()` from finding
 *   packages that are transitive dependencies.
 */
export function createPluginResolver(baseDir?: string): PluginResolver {
  return async (name: string, options: Record<string, unknown>): Promise<NeoHexoPlugin> => {
    const specifier = resolvePluginSpecifier(name);

    let mod: Record<string, unknown>;
    try {
      mod = await import(specifier) as Record<string, unknown>;
    } catch (directErr) {
      if (!baseDir) {
        throw new Error(
          `Failed to load plugin "${name}" (resolved to "${specifier}"). ` +
          `Make sure the package is installed.\n` +
          `Original error: ${directErr instanceof Error ? directErr.message : String(directErr)}`,
        );
      }
      // Fallback: resolve from the project's dependency tree
      try {
        const resolved = await resolveFromProject(specifier, baseDir);
        mod = await import(resolved) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Failed to load plugin "${name}" (resolved to "${specifier}"). ` +
          `Make sure the package is installed.\n` +
          `Original error: ${directErr instanceof Error ? directErr.message : String(directErr)}`,
        );
      }
    }

    // Look for a default export (plugin factory function)
    const factory = mod.default;
    if (typeof factory !== 'function') {
      throw new Error(
        `Plugin "${name}" (${specifier}) does not export a default factory function.`,
      );
    }

    // Call the factory with the options from YAML
    const plugin = factory(options) as NeoHexoPlugin;

    if (!plugin || typeof plugin !== 'object' || !plugin.name) {
      throw new Error(
        `Plugin "${name}" factory did not return a valid NeoHexoPlugin object.`,
      );
    }

    return plugin;
  };
}

/**
 * Get the list of built-in plugin shorthand names.
 */
export function getBuiltinPluginNames(): string[] {
  return Object.keys(BUILTIN_PLUGINS);
}

export { BUILTIN_PLUGINS };
