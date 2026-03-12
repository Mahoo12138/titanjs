/**
 * Tests for @neo-hexo/cli — config-loader
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as nodePath from 'node:path';
import * as os from 'node:os';
import { findConfigFile, loadConfigFile, loadConfig } from '../src/config-loader.js';

describe('Config Loader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'neo-hexo-cli-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── findConfigFile ─────────────────────────────────────────────────────────

  describe('findConfigFile', () => {
    it('should return null when no config file exists', async () => {
      const result = await findConfigFile(tmpDir);
      expect(result).toBeNull();
    });

    it('should find neo-hexo.yaml', async () => {
      await fs.writeFile(nodePath.join(tmpDir, 'neo-hexo.yaml'), 'title: Test');
      const result = await findConfigFile(tmpDir);
      expect(result).toBe(nodePath.join(tmpDir, 'neo-hexo.yaml'));
    });

    it('should find neo-hexo.yml', async () => {
      await fs.writeFile(nodePath.join(tmpDir, 'neo-hexo.yml'), 'title: Test');
      const result = await findConfigFile(tmpDir);
      expect(result).toBe(nodePath.join(tmpDir, 'neo-hexo.yml'));
    });

    it('should find _config.yaml as fallback', async () => {
      await fs.writeFile(nodePath.join(tmpDir, '_config.yaml'), 'title: Test');
      const result = await findConfigFile(tmpDir);
      expect(result).toBe(nodePath.join(tmpDir, '_config.yaml'));
    });

    it('should find _config.yml as fallback', async () => {
      await fs.writeFile(nodePath.join(tmpDir, '_config.yml'), 'title: Test');
      const result = await findConfigFile(tmpDir);
      expect(result).toBe(nodePath.join(tmpDir, '_config.yml'));
    });

    it('should prefer neo-hexo.yaml over neo-hexo.yml', async () => {
      await fs.writeFile(nodePath.join(tmpDir, 'neo-hexo.yaml'), 'title: YAML');
      await fs.writeFile(nodePath.join(tmpDir, 'neo-hexo.yml'), 'title: YML');
      const result = await findConfigFile(tmpDir);
      expect(result).toBe(nodePath.join(tmpDir, 'neo-hexo.yaml'));
    });

    it('should prefer neo-hexo.yaml over _config.yaml', async () => {
      await fs.writeFile(nodePath.join(tmpDir, 'neo-hexo.yaml'), 'title: neo');
      await fs.writeFile(nodePath.join(tmpDir, '_config.yaml'), 'title: old');
      const result = await findConfigFile(tmpDir);
      expect(result).toBe(nodePath.join(tmpDir, 'neo-hexo.yaml'));
    });

    it('should resolve an explicit path relative to baseDir', async () => {
      await fs.writeFile(nodePath.join(tmpDir, 'custom.yaml'), 'title: Custom');
      const result = await findConfigFile(tmpDir, 'custom.yaml');
      expect(result).toBe(nodePath.resolve(tmpDir, 'custom.yaml'));
    });

    it('should return null if explicit path does not exist', async () => {
      const result = await findConfigFile(tmpDir, 'nonexistent.yaml');
      expect(result).toBeNull();
    });
  });

  // ── loadConfigFile ─────────────────────────────────────────────────────────

  describe('loadConfigFile', () => {
    it('should parse a YAML config file', async () => {
      const configPath = nodePath.join(tmpDir, 'neo-hexo.yaml');
      await fs.writeFile(configPath, [
        'title: My Site',
        'url: http://example.com',
        'sourceDir: src',
        'plugins:',
        '  - renderer-markdown',
        '  - name: highlight',
        '    theme: github-dark',
      ].join('\n'));
      const config = await loadConfigFile(configPath);
      expect(config.title).toBe('My Site');
      expect(config.url).toBe('http://example.com');
      expect(config.sourceDir).toBe('src');
      expect(config.plugins).toHaveLength(2);
      expect(config.plugins![0]).toBe('renderer-markdown');
      expect(config.plugins![1]).toEqual({ name: 'highlight', theme: 'github-dark' });
    });

    it('should return empty object for empty YAML file', async () => {
      const configPath = nodePath.join(tmpDir, 'empty.yaml');
      await fs.writeFile(configPath, '');
      const config = await loadConfigFile(configPath);
      expect(config).toEqual({});
    });

    it('should throw for invalid YAML (non-mapping)', async () => {
      const configPath = nodePath.join(tmpDir, 'bad.yaml');
      await fs.writeFile(configPath, '- just\n- a\n- list');
      await expect(loadConfigFile(configPath)).rejects.toThrow('Invalid config file');
    });
  });

  // ── loadConfig ─────────────────────────────────────────────────────────────

  describe('loadConfig', () => {
    it('should return null when no config file is found', async () => {
      const result = await loadConfig(tmpDir);
      expect(result).toBeNull();
    });

    it('should find and parse a config file', async () => {
      const configPath = nodePath.join(tmpDir, 'neo-hexo.yaml');
      await fs.writeFile(configPath, 'title: Loaded');
      const result = await loadConfig(tmpDir);
      expect(result).not.toBeNull();
      expect(result!.config.title).toBe('Loaded');
      expect(result!.configPath).toBe(configPath);
    });

    it('should use explicit config path', async () => {
      await fs.writeFile(nodePath.join(tmpDir, 'custom.yml'), 'title: Custom');
      const result = await loadConfig(tmpDir, 'custom.yml');
      expect(result).not.toBeNull();
      expect(result!.config.title).toBe('Custom');
    });
  });
});
