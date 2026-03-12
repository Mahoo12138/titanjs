/**
 * @neo-hexo/cli — Plugin Resolver
 *
 * Maps plugin names from `neo-hexo.yaml` to plugin factory functions.
 * Supports:
 *   1. Built-in shorthand names (e.g., 'renderer-markdown' → @neo-hexo/renderer-markdown)
 *   2. Scoped package names (e.g., '@neo-hexo/highlight')
 *   3. Bare npm package names (e.g., 'neo-hexo-plugin-foo')
 */

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

/**
 * Create the default plugin resolver.
 * Uses dynamic `import()` to load plugin packages.
 */
export function createPluginResolver(): PluginResolver {
  return async (name: string, options: Record<string, unknown>): Promise<NeoHexoPlugin> => {
    const specifier = resolvePluginSpecifier(name);

    let mod: Record<string, unknown>;
    try {
      mod = await import(specifier) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `Failed to load plugin "${name}" (resolved to "${specifier}"). ` +
        `Make sure the package is installed.\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
      );
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
