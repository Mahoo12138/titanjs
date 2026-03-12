/**
 * @neo-hexo/deployer-git
 *
 * Git-based deployment plugin for Neo-Hexo.
 * Deploys the generated site to a Git repository (e.g., GitHub Pages).
 *
 * Usage:
 * ```ts
 * import gitDeploy from '@neo-hexo/deployer-git';
 *
 * export default defineConfig({
 *   plugins: [
 *     gitDeploy({
 *       repo: 'https://github.com/user/user.github.io.git',
 *       branch: 'main',
 *     }),
 *   ],
 * });
 * ```
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import type { NeoHexoPlugin, ResolvedConfig } from '@neo-hexo/core';

const execFileAsync = promisify(execFile);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GitDeployOptions {
  /** Remote repository URL (required). */
  repo: string;
  /** Branch to deploy to (default: 'gh-pages'). */
  branch?: string;
  /** Git commit message (default: 'Site updated: {date}'). */
  message?: string;
  /** User name for the deploy commit. */
  name?: string;
  /** User email for the deploy commit. */
  email?: string;
  /** Whether to force push (default: false). */
  force?: boolean;
  /** Files/patterns to ignore during deploy. */
  ignore?: string[];
}

// ─── Git Helpers ─────────────────────────────────────────────────────────────

async function git(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd });
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await fs.access(nodePath.join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

// ─── Deploy Implementation ──────────────────────────────────────────────────

async function deployToGit(
  publicDir: string,
  options: Required<Omit<GitDeployOptions, 'ignore'>> & { ignore: string[] },
): Promise<void> {
  // Verify public directory exists
  try {
    await fs.access(publicDir);
  } catch {
    throw new Error(`Public directory not found: ${publicDir}. Run "generate" first.`);
  }

  const deployDir = nodePath.join(publicDir, '.deploy_git');

  // Initialize or reset deploy directory
  if (await isGitRepo(deployDir)) {
    // Clear existing content (but keep .git)
    const entries = await fs.readdir(deployDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      await fs.rm(nodePath.join(deployDir, entry.name), { recursive: true, force: true });
    }
  } else {
    await fs.mkdir(deployDir, { recursive: true });
    await git(['init'], deployDir);
    await git(['checkout', '--orphan', options.branch], deployDir);
  }

  // Copy public files to deploy directory
  await copyDir(publicDir, deployDir, ['.deploy_git', ...options.ignore]);

  // Configure git user
  if (options.name) {
    await git(['config', 'user.name', options.name], deployDir);
  }
  if (options.email) {
    await git(['config', 'user.email', options.email], deployDir);
  }

  // Stage all files
  await git(['add', '-A'], deployDir);

  // Check if there are changes to commit
  const { stdout: status } = await git(['status', '--porcelain'], deployDir);
  if (!status.trim()) {
    console.log('Nothing to deploy — no changes detected.');
    return;
  }

  // Commit
  const message = options.message.replace('{date}', new Date().toISOString());
  await git(['commit', '-m', message], deployDir);

  // Push
  const pushArgs = ['push', '-u', options.repo, `HEAD:${options.branch}`];
  if (options.force) {
    pushArgs.splice(1, 0, '--force');
  }
  await git(pushArgs, deployDir);

  console.log('Deployed to %s branch "%s".', options.repo, options.branch);
}

/**
 * Recursively copy directory, skipping excluded entries.
 */
async function copyDir(src: string, dest: string, exclude: string[]): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;

    const srcPath = nodePath.join(src, entry.name);
    const destPath = nodePath.join(dest, entry.name);

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyDir(srcPath, destPath, exclude);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// ─── Plugin Factory ──────────────────────────────────────────────────────────

export default function deployerGitPlugin(
  options: GitDeployOptions,
): NeoHexoPlugin {
  const {
    repo,
    branch = 'gh-pages',
    message = 'Site updated: {date}',
    name = '',
    email = '',
    force = false,
    ignore = [],
  } = options;

  let publicDir = '';

  return {
    name: 'neo-hexo:deployer-git',

    hooks: {
      configResolved(config: ResolvedConfig) {
        publicDir = config.publicDir;
      },

      async deploy() {
        await deployToGit(publicDir, {
          repo,
          branch,
          message,
          name,
          email,
          force,
          ignore,
        });
      },
    },
  };
}

// Re-export
export type { GitDeployOptions as Options };
