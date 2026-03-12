/**
 * @neo-hexo/cli — CLI Entry Point
 *
 * Provides the `neo-hexo` command. Loads `neo-hexo.yaml`, resolves plugins,
 * initializes the NeoHexo engine, and dispatches commands.
 *
 * Usage:
 *   neo-hexo generate
 *   neo-hexo new post "My First Post"
 *   neo-hexo deploy
 *   neo-hexo clean
 *   neo-hexo list [routes|posts]
 *   neo-hexo init [directory]
 *   neo-hexo help
 */

import * as nodePath from 'node:path';
import { defineCommand, runMain } from 'citty';
import { NeoHexo, yamlConfigToUserConfig } from '@neo-hexo/core';
import type { YamlConfig } from '@neo-hexo/core';
import { loadConfig } from './config-loader.js';
import { createPluginResolver } from './plugin-resolver.js';

// ─── Arg Helpers ─────────────────────────────────────────────────────────────

/** Extract a string value from a citty arg (which may be string | boolean | string[]). */
function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

// ─── Version ─────────────────────────────────────────────────────────────────

// Read from package.json at build time — placeholder replaced by the build step
const VERSION = '0.0.1';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

/**
 * Bootstrap the NeoHexo instance from a project directory.
 */
async function bootstrap(
  baseDir: string,
  configPath?: string,
): Promise<NeoHexo> {
  const result = await loadConfig(baseDir, configPath);

  let yamlConfig: YamlConfig = {};
  if (result) {
    yamlConfig = result.config;
  }

  // Resolve YAML plugin entries to NeoHexoPlugin instances
  const resolver = createPluginResolver();
  const userConfig = await yamlConfigToUserConfig(yamlConfig, resolver);

  const hexo = new NeoHexo(baseDir, userConfig);
  await hexo.init();
  return hexo;
}

// ─── Commands ────────────────────────────────────────────────────────────────

const main = defineCommand({
  meta: {
    name: 'neo-hexo',
    version: VERSION,
    description: 'Neo-Hexo — A modern static site generator.',
  },
  args: {
    config: {
      type: 'string',
      alias: 'c',
      description: 'Path to config file (default: neo-hexo.yaml)',
    },
    cwd: {
      type: 'string',
      description: 'Working directory (default: current directory)',
    },
    debug: {
      type: 'boolean',
      alias: 'd',
      description: 'Enable debug mode',
    },
  },
  subCommands: {
    init: defineCommand({
      meta: { description: 'Create a new Neo-Hexo project.' },
      args: {
        dir: {
          type: 'positional',
          description: 'Target directory',
          required: false,
        },
      },
      async run({ args }) {
        const { initProject } = await import('./commands/init.js');
        await initProject(str(args.dir, '.'));
      },
    }),

    generate: defineCommand({
      meta: { description: 'Generate static files.' },
      args: {
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.build();
          console.log('Generation complete.');
        } finally {
          await hexo.exit();
        }
      },
    }),

    clean: defineCommand({
      meta: { description: 'Remove generated files and cache.' },
      args: {
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.commands.execute('clean', { _: [] });
        } finally {
          await hexo.exit();
        }
      },
    }),

    new: defineCommand({
      meta: { description: 'Create a new post, page, or draft.' },
      args: {
        layout: {
          type: 'positional',
          description: 'Layout (post, page, draft)',
          required: false,
        },
        title: {
          type: 'positional',
          description: 'Post title',
          required: false,
        },
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.commands.execute('new', {
            _: [str(args.layout, 'post'), str(args.title, 'Untitled')],
          });
        } finally {
          await hexo.exit();
        }
      },
    }),

    deploy: defineCommand({
      meta: { description: 'Deploy the site.' },
      args: {
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
        generate: {
          type: 'boolean',
          alias: 'g',
          description: 'Generate before deploying',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          if (args.generate) {
            await hexo.build();
          }
          await hexo.deploy();
          console.log('Deploy complete.');
        } finally {
          await hexo.exit();
        }
      },
    }),

    publish: defineCommand({
      meta: { description: 'Move a draft to published posts.' },
      args: {
        filename: {
          type: 'positional',
          description: 'Draft filename to publish',
          required: true,
        },
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.commands.execute('publish', { _: [str(args.filename)] });
        } finally {
          await hexo.exit();
        }
      },
    }),

    server: defineCommand({
      meta: { description: 'Start the development server.' },
      args: {
        port: {
          type: 'string',
          alias: 'p',
          description: 'Port to listen on (default: 4000)',
        },
        host: {
          type: 'string',
          description: 'Host to bind to (default: localhost)',
        },
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.build();
          const cmdArgs: Record<string, unknown> & { _: string[] } = { _: [] };
          if (args.port) cmdArgs.port = parseInt(str(args.port), 10);
          if (args.host) cmdArgs.host = str(args.host);
          await hexo.commands.execute('server', cmdArgs);
        } finally {
          await hexo.exit();
        }
      },
    }),

    serve: defineCommand({
      meta: { description: 'Alias for "server" — start the dev server.' },
      args: {
        port: {
          type: 'string',
          alias: 'p',
          description: 'Port to listen on (default: 4000)',
        },
        host: {
          type: 'string',
          description: 'Host to bind to (default: localhost)',
        },
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.build();
          const cmdArgs: Record<string, unknown> & { _: string[] } = { _: [] };
          if (args.port) cmdArgs.port = parseInt(str(args.port), 10);
          if (args.host) cmdArgs.host = str(args.host);
          await hexo.commands.execute('server', cmdArgs);
        } finally {
          await hexo.exit();
        }
      },
    }),

    list: defineCommand({
      meta: { description: 'List routes, posts, tags, or categories.' },
      args: {
        type: {
          type: 'positional',
          description: 'What to list (routes, posts, tags, categories)',
          required: false,
        },
        config: {
          type: 'string',
          alias: 'c',
          description: 'Config file path',
        },
        cwd: {
          type: 'string',
          description: 'Working directory',
        },
      },
      async run({ args }) {
        const baseDir = nodePath.resolve(str(args.cwd) || process.cwd());
        const hexo = await bootstrap(baseDir, str(args.config) || undefined);
        try {
          await hexo.commands.execute('list', { _: [str(args.type, 'routes')] });
        } finally {
          await hexo.exit();
        }
      },
    }),
  },
});

// ─── Exports ─────────────────────────────────────────────────────────────────

export { main, bootstrap };
export { loadConfig, findConfigFile, loadConfigFile } from './config-loader.js';
export { createPluginResolver, BUILTIN_PLUGINS, getBuiltinPluginNames } from './plugin-resolver.js';

/**
 * Run the CLI. This is the entry point for the `neo-hexo` binary.
 */
export function run(): void {
  runMain(main);
}
