/**
 * @neo-hexo/console — Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Context } from '@neo-hexo/core';
import { CommandRegistry, CommandRegistryKey } from '@neo-hexo/core';
import { ScaffoldManager, ScaffoldServiceKey, PostServiceKey, RouterServiceKey, Router } from '@neo-hexo/core';
import consolePlugin from '@neo-hexo/console';

describe('@neo-hexo/console', () => {
  let ctx: Context;
  let commands: CommandRegistry;

  beforeEach(() => {
    ctx = new Context();
    commands = new CommandRegistry();
    ctx.provide(CommandRegistryKey, commands);

    // Provide minimal subsystems
    const router = new Router();
    ctx.provide(RouterServiceKey, router);
  });

  it('should register built-in commands', () => {
    const plugin = consolePlugin();

    // Set config via hooks
    if (plugin.hooks?.configResolved) {
      (plugin.hooks.configResolved as Function)({
        title: 'Test',
        url: 'https://example.com',
        sourceDir: '/tmp/src',
        publicDir: '/tmp/public',
        root: '/',
      });
    }

    plugin.apply!(ctx);

    expect(commands.has('clean')).toBe(true);
    expect(commands.has('generate')).toBe(true);
    expect(commands.has('new')).toBe(true);
    expect(commands.has('deploy')).toBe(true);
    expect(commands.has('publish')).toBe(true);
    expect(commands.has('list')).toBe(true);
  });

  it('should respect disabled commands', () => {
    const plugin = consolePlugin({ clean: false, deploy: false });

    if (plugin.hooks?.configResolved) {
      (plugin.hooks.configResolved as Function)({
        title: 'Test',
        url: 'https://example.com',
        sourceDir: '/tmp/src',
        publicDir: '/tmp/public',
        root: '/',
      });
    }

    plugin.apply!(ctx);

    expect(commands.has('clean')).toBe(false);
    expect(commands.has('deploy')).toBe(false);
    expect(commands.has('generate')).toBe(true);
  });

  it('should list registered commands', () => {
    const plugin = consolePlugin();

    if (plugin.hooks?.configResolved) {
      (plugin.hooks.configResolved as Function)({
        title: 'Test',
        url: 'https://example.com',
        sourceDir: '/tmp/src',
        publicDir: '/tmp/public',
        root: '/',
      });
    }

    plugin.apply!(ctx);

    const list = commands.list();
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(list.map((c) => c.name)).toContain('generate');
  });
});
