/**
 * Tests for @neo-hexo/cli — init command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { initProject } from '../src/commands/init.js';

describe('Init Command', () => {
  let tmpDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'neo-hexo-init-test-'));
    projectDir = nodePath.join(tmpDir, 'my-site');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should create the directory structure', async () => {
    await initProject(projectDir);

    const entries = await fs.readdir(projectDir);
    expect(entries).toContain('source');
    expect(entries).toContain('public');
    expect(entries).toContain('scaffolds');
    expect(entries).toContain('neo-hexo.yaml');
    expect(entries).toContain('package.json');
    expect(entries).toContain('.gitignore');

    // Check subdirectories
    const sourceEntries = await fs.readdir(nodePath.join(projectDir, 'source'));
    expect(sourceEntries).toContain('_posts');
    expect(sourceEntries).toContain('_drafts');
    expect(sourceEntries).toContain('_data');
  });

  it('should create a valid neo-hexo.yaml', async () => {
    await initProject(projectDir);

    const raw = await fs.readFile(nodePath.join(projectDir, 'neo-hexo.yaml'), 'utf-8');
    expect(raw).toContain('title:');
    expect(raw).toContain('plugins:');
    expect(raw).toContain('renderer-markdown');
  });

  it('should create a hello-world post', async () => {
    await initProject(projectDir);

    const postPath = nodePath.join(projectDir, 'source/_posts/hello-world.md');
    const content = await fs.readFile(postPath, 'utf-8');
    expect(content).toContain('title: Hello World');
    expect(content).toContain('Welcome to');
  });

  it('should create scaffold templates', async () => {
    await initProject(projectDir);

    const postScaffold = await fs.readFile(nodePath.join(projectDir, 'scaffolds/post.md'), 'utf-8');
    expect(postScaffold).toContain('title:');

    const pageScaffold = await fs.readFile(nodePath.join(projectDir, 'scaffolds/page.md'), 'utf-8');
    expect(pageScaffold).toContain('title:');

    const draftScaffold = await fs.readFile(nodePath.join(projectDir, 'scaffolds/draft.md'), 'utf-8');
    expect(draftScaffold).toContain('title:');
  });

  it('should create a package.json with neo-hexo dependency', async () => {
    await initProject(projectDir);

    const raw = await fs.readFile(nodePath.join(projectDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies['neo-hexo']).toBeDefined();
  });

  it('should not overwrite existing files', async () => {
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(nodePath.join(projectDir, 'neo-hexo.yaml'), 'title: Existing');

    await initProject(projectDir);

    const raw = await fs.readFile(nodePath.join(projectDir, 'neo-hexo.yaml'), 'utf-8');
    expect(raw).toBe('title: Existing');
  });

  it('should create .gitignore', async () => {
    await initProject(projectDir);

    const raw = await fs.readFile(nodePath.join(projectDir, '.gitignore'), 'utf-8');
    expect(raw).toContain('public/');
    expect(raw).toContain('node_modules/');
  });
});
