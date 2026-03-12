/**
 * @neo-hexo/deployer-git — Tests
 */

import { describe, it, expect } from 'vitest';
import deployerGitPlugin from '@neo-hexo/deployer-git';

describe('@neo-hexo/deployer-git', () => {
  it('should create a plugin with name', () => {
    const plugin = deployerGitPlugin({
      repo: 'https://github.com/user/repo.git',
    });
    expect(plugin.name).toBe('neo-hexo:deployer-git');
  });

  it('should have configResolved and deploy hooks', () => {
    const plugin = deployerGitPlugin({
      repo: 'https://github.com/user/repo.git',
      branch: 'main',
      message: 'Deploy {date}',
    });

    expect(plugin.hooks).toBeDefined();
    expect(plugin.hooks!.configResolved).toBeDefined();
    expect(plugin.hooks!.deploy).toBeDefined();
  });

  it('should accept all options', () => {
    const plugin = deployerGitPlugin({
      repo: 'git@github.com:user/repo.git',
      branch: 'gh-pages',
      message: 'Update: {date}',
      name: 'Bot',
      email: 'bot@example.com',
      force: true,
      ignore: ['.DS_Store'],
    });
    expect(plugin.name).toBe('neo-hexo:deployer-git');
  });
});
