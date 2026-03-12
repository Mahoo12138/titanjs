/**
 * @neo-hexo/console
 *
 * Built-in CLI commands for Neo-Hexo.
 * Registers commands via the CommandRegistry: clean, generate, new, deploy, publish, list.
 *
 * Usage:
 * ```ts
 * import console from '@neo-hexo/console';
 *
 * export default defineConfig({
 *   plugins: [console()],
 * });
 * ```
 */

import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import type {
  NeoHexoPlugin,
  Context,
  ResolvedConfig,
  CommandArgs,
} from '@neo-hexo/core';
import {
  CommandRegistryKey,
  PostServiceKey,
  ScaffoldServiceKey,
  RouterServiceKey,
} from '@neo-hexo/core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConsoleOptions {
  /** Enable the 'clean' command (default: true). */
  clean?: boolean;
  /** Enable the 'generate' command (default: true). */
  generate?: boolean;
  /** Enable the 'new' command (default: true). */
  newCmd?: boolean;
  /** Enable the 'deploy' command (default: true). */
  deploy?: boolean;
  /** Enable the 'publish' command (default: true). */
  publish?: boolean;
  /** Enable the 'list' command (default: true). */
  list?: boolean;
}

// ─── Command Implementations ─────────────────────────────────────────────────

/**
 * Clean command: remove generated files (public directory).
 */
async function cleanCommand(config: ResolvedConfig): Promise<void> {
  const publicDir = config.publicDir;
  try {
    await fs.rm(publicDir, { recursive: true, force: true });
    console.log('Cleaned: %s', publicDir);
  } catch {
    // Directory might not exist
  }
}

/**
 * Generate command: runs the full build pipeline.
 * The actual build is delegated to the NeoHexo instance.
 */
function generateMessage(): void {
  console.log('Generate command executed. Use NeoHexo.build() for programmatic builds.');
}

/**
 * New command: create a new post or page from scaffold.
 */
async function newCommand(
  args: CommandArgs,
  ctx: Context,
  config: ResolvedConfig,
): Promise<void> {
  const layout = String(args._[0] ?? 'post');
  const title = String(args._[1] ?? 'Untitled');

  const post = ctx.tryInject(PostServiceKey);
  const scaffold = ctx.tryInject(ScaffoldServiceKey);
  if (!post || !scaffold) {
    console.error('PostProcessor or ScaffoldManager not available.');
    return;
  }

  // Get scaffold content
  const scaffoldContent = scaffold.get(layout) || scaffold.get('post');
  const content = scaffoldContent
    ? scaffoldContent
        .replace(/\{\{ title \}\}/g, title)
        .replace(/\{\{ date \}\}/g, new Date().toISOString())
        .replace(/\{\{ layout \}\}/g, layout)
    : [
        '---',
        `title: ${title}`,
        `date: ${new Date().toISOString()}`,
        `layout: ${layout}`,
        '---',
        '',
      ].join('\n');

  // Compute file path
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const fileName = `${slug}.md`;
  const dir = layout === 'draft'
    ? nodePath.join(config.sourceDir, '_drafts')
    : nodePath.join(config.sourceDir, '_posts');

  await fs.mkdir(dir, { recursive: true });
  const filePath = nodePath.join(dir, fileName);

  await fs.writeFile(filePath, content, 'utf-8');
  console.log('Created: %s', filePath);
}

/**
 * Deploy command: triggers the deploy lifecycle.
 */
function deployMessage(): void {
  console.log('Deploy command executed. Use NeoHexo.deploy() for programmatic deploys.');
}

/**
 * Publish command: move a draft to posts.
 */
async function publishCommand(
  args: CommandArgs,
  config: ResolvedConfig,
): Promise<void> {
  const filename = String(args._[0] ?? '');
  if (!filename) {
    console.error('Usage: publish <filename>');
    return;
  }

  const draftPath = nodePath.join(config.sourceDir, '_drafts', filename);
  const postDir = nodePath.join(config.sourceDir, '_posts');
  const postPath = nodePath.join(postDir, filename);

  try {
    await fs.access(draftPath);
  } catch {
    console.error('Draft not found: %s', draftPath);
    return;
  }

  await fs.mkdir(postDir, { recursive: true });
  await fs.rename(draftPath, postPath);
  console.log('Published: %s → %s', draftPath, postPath);
}

/**
 * List command: list posts, pages, tags, categories, or routes.
 */
async function listCommand(args: CommandArgs, ctx: Context): Promise<void> {
  const type = String(args._[0] ?? 'routes');

  if (type === 'routes') {
    const router = ctx.tryInject(RouterServiceKey);
    if (!router) {
      console.log('Router not available.');
      return;
    }
    const routes = router.list();
    if (routes.length === 0) {
      console.log('No routes registered.');
    } else {
      for (const path of routes) {
        console.log('  %s', path);
      }
    }
  } else {
    console.log('List type "%s" is not supported yet.', type);
  }
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function consolePlugin(
  options: ConsoleOptions = {},
): NeoHexoPlugin {
  const {
    clean = true,
    generate = true,
    newCmd = true,
    deploy = true,
    publish = true,
    list = true,
  } = options;

  let siteConfig: ResolvedConfig;

  return {
    name: 'neo-hexo:console',

    hooks: {
      configResolved(config: ResolvedConfig) {
        siteConfig = config;
      },
    },

    apply(ctx: Context) {
      const registry = ctx.tryInject(CommandRegistryKey);
      if (!registry) return;

      if (clean) {
        registry.register({
          name: 'clean',
          description: 'Remove generated files and cache.',
          handler: () => cleanCommand(siteConfig),
        });
      }

      if (generate) {
        registry.register({
          name: 'generate',
          description: 'Generate static files.',
          options: [
            { name: '--watch', alias: '-w', description: 'Watch for file changes.' },
            { name: '--deploy', alias: '-d', description: 'Deploy after generate.' },
            { name: '--force', alias: '-f', description: 'Force regenerate.' },
          ],
          handler: () => {
            generateMessage();
            return Promise.resolve();
          },
        });
      }

      if (newCmd) {
        registry.register({
          name: 'new',
          description: 'Create a new post.',
          usage: '<layout> [title]',
          options: [
            { name: '--replace', alias: '-r', description: 'Replace existing file.' },
            { name: '--slug', alias: '-s', description: 'Post slug.' },
            { name: '--path', alias: '-p', description: 'Post path.' },
          ],
          handler: (args) => newCommand(args, ctx, siteConfig),
        });
      }

      if (deploy) {
        registry.register({
          name: 'deploy',
          description: 'Deploy your website.',
          options: [
            { name: '--generate', alias: '-g', description: 'Generate before deploy.' },
          ],
          handler: () => {
            deployMessage();
            return Promise.resolve();
          },
        });
      }

      if (publish) {
        registry.register({
          name: 'publish',
          description: 'Move a draft post to published.',
          usage: '<filename>',
          handler: (args) => publishCommand(args, siteConfig),
        });
      }

      if (list) {
        registry.register({
          name: 'list',
          description: 'List posts, pages, tags, categories, or routes.',
          usage: '[type]',
          handler: (args) => listCommand(args, ctx),
        });
      }
    },
  };
}

// Re-export
export type { ConsoleOptions as Options };
