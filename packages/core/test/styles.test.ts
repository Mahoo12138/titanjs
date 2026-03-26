/**
 * Tests for the Style System (Phase 4)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  extractAssignedTokens,
  validateTokenCompleteness,
  lintPluginCSS,
  scopeCSS,
  generateUserTokenOverrides,
  loadFrameworkBase,
  loadThemeGlobalStyles,
  buildStyles,
  DESIGN_TOKENS,
} from '../src/styles.js'

// ── Token Extraction ──

describe('extractAssignedTokens', () => {
  it('should extract assigned --t-* tokens from CSS', () => {
    const css = `
      :root {
        --t-color-bg: #ffffff;
        --t-color-text: #111827;
        --t-font-sans: 'Inter', sans-serif;
      }
    `
    const tokens = extractAssignedTokens(css)
    expect(tokens.has('--t-color-bg')).toBe(true)
    expect(tokens.has('--t-color-text')).toBe(true)
    expect(tokens.has('--t-font-sans')).toBe(true)
  })

  it('should not extract empty token values', () => {
    const css = `
      :root {
        --t-color-bg:   ;
        --t-color-text: #111827;
      }
    `
    const tokens = extractAssignedTokens(css)
    expect(tokens.has('--t-color-bg')).toBe(false)
    expect(tokens.has('--t-color-text')).toBe(true)
  })

  it('should handle dark mode overrides', () => {
    const css = `
      :root { --t-color-bg: #fff; }
      @media (prefers-color-scheme: dark) {
        :root { --t-color-bg: #000; }
      }
    `
    const tokens = extractAssignedTokens(css)
    expect(tokens.has('--t-color-bg')).toBe(true)
  })
})

// ── Token Completeness Validation ──

describe('validateTokenCompleteness', () => {
  it('should return no warnings when all tokens are assigned', () => {
    // Build CSS that assigns all tokens
    const lines = DESIGN_TOKENS.map(t => `${t}: some-value;`)
    const css = `:root { ${lines.join(' ')} }`
    const warnings = validateTokenCompleteness(css, 'test-theme')
    expect(warnings).toHaveLength(0)
  })

  it('should return warnings for missing tokens', () => {
    const css = ':root { --t-color-bg: #fff; }'
    const warnings = validateTokenCompleteness(css, 'test-theme')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.includes('--t-color-text'))).toBe(true)
  })

  it('should include theme name in warnings', () => {
    const css = ':root {}'
    const warnings = validateTokenCompleteness(css, 'my-cool-theme')
    expect(warnings[0]).toContain('my-cool-theme')
  })
})

// ── Plugin CSS Lint ──

describe('lintPluginCSS', () => {
  it('should detect hardcoded hex colors', () => {
    const css = '.card { color: #111827; }'
    const violations = lintPluginCSS(css, 'test-plugin')
    expect(violations).toHaveLength(1)
    expect(violations[0].property).toBe('color')
    expect(violations[0].value).toContain('#111827')
  })

  it('should detect hardcoded rgb colors', () => {
    const css = '.card { background-color: rgb(17, 24, 39); }'
    const violations = lintPluginCSS(css, 'test-plugin')
    expect(violations).toHaveLength(1)
    expect(violations[0].property).toBe('background-color')
  })

  it('should detect named colors', () => {
    const css = '.card { border-color: red; }'
    const violations = lintPluginCSS(css, 'test-plugin')
    expect(violations).toHaveLength(1)
  })

  it('should allow --t-* token references', () => {
    const css = `
      .card { color: var(--t-color-text); }
      .card { background: var(--t-color-bg); }
      .card { border: 1px solid var(--t-color-border); }
    `
    const violations = lintPluginCSS(css, 'test-plugin')
    expect(violations).toHaveLength(0)
  })

  it('should not lint non-color properties', () => {
    const css = `
      .card { width: 100%; }
      .card { display: flex; }
      .card { padding: 1rem; }
    `
    const violations = lintPluginCSS(css, 'test-plugin')
    expect(violations).toHaveLength(0)
  })

  it('should skip CSS comments', () => {
    const css = `
      /* color: #111827; */
      .card { color: var(--t-color-text); }
    `
    const violations = lintPluginCSS(css, 'test-plugin')
    expect(violations).toHaveLength(0)
  })

  it('should include plugin name in violation messages', () => {
    const css = '.card { color: #000; }'
    const violations = lintPluginCSS(css, '@titan/plugin-comments')
    expect(violations[0].message).toContain('@titan/plugin-comments')
  })
})

// ── CSS Scoping ──

describe('scopeCSS', () => {
  it('should scope regular class names', () => {
    const css = '.container { display: flex; }'
    const { css: scoped, classMap } = scopeCSS(css, 'my-theme', 'Header.module.css')
    expect(scoped).not.toContain('.container')
    expect(scoped).toContain('my-theme__container_')
    expect(classMap['container']).toBeDefined()
    expect(classMap['container']).toContain('my-theme__container_')
  })

  it('should not scope titan-* framework classes', () => {
    const css = '.titan-layout { display: flex; } .titan-prose { color: red; }'
    const { css: scoped } = scopeCSS(css, 'my-theme', 'Layout.css')
    expect(scoped).toContain('.titan-layout')
    expect(scoped).toContain('.titan-prose')
  })

  it('should generate consistent classMap', () => {
    const css = '.header { } .nav { } .header a { }'
    const { classMap } = scopeCSS(css, 'my-theme', 'Header.module.css')
    expect(classMap['header']).toBeDefined()
    expect(classMap['nav']).toBeDefined()
  })

  it('should preserve non-class selectors', () => {
    const css = 'a { color: blue; } div > span { display: inline; }'
    const { css: scoped } = scopeCSS(css, 'my-theme', 'test.css')
    expect(scoped).toContain('a { color: blue; }')
  })
})

// ── User Token Overrides ──

describe('generateUserTokenOverrides', () => {
  it('should generate :root block with overrides', () => {
    const overrides = {
      '--t-color-accent': '#e11d48',
      '--t-font-sans': '"Noto Serif SC", serif',
    }
    const css = generateUserTokenOverrides(overrides)
    expect(css).toContain(':root {')
    expect(css).toContain('--t-color-accent: #e11d48;')
    expect(css).toContain('--t-font-sans: "Noto Serif SC", serif;')
  })

  it('should return empty string for empty tokens', () => {
    expect(generateUserTokenOverrides({})).toBe('')
  })
})

// ── Framework Base Loading ──

describe('loadFrameworkBase', () => {
  it('should load titan-base.css', async () => {
    const css = await loadFrameworkBase()
    expect(css).toContain('box-sizing: border-box')
    expect(css).toContain('--t-color-bg')
    expect(css).toContain('--t-font-sans')
    expect(css).toContain('--t-radius-md')
  })
})

// ── Theme Style Discovery ──

describe('loadThemeGlobalStyles', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-style-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should load styles/tokens.css + styles/global.css', async () => {
    const stylesDir = path.join(tmpDir, 'styles')
    await fs.mkdir(stylesDir)
    await fs.writeFile(path.join(stylesDir, 'tokens.css'), ':root { --t-color-bg: #fff; }')
    await fs.writeFile(path.join(stylesDir, 'global.css'), 'body { font-size: 16px; }')

    const css = await loadThemeGlobalStyles(tmpDir)
    expect(css).toContain('--t-color-bg: #fff')
    expect(css).toContain('font-size: 16px')
  })

  it('should fall back to legacy style.css', async () => {
    await fs.writeFile(path.join(tmpDir, 'style.css'), '.titan-layout { color: red; }')

    const css = await loadThemeGlobalStyles(tmpDir)
    expect(css).toContain('.titan-layout')
  })

  it('should return empty string when no styles found', async () => {
    const css = await loadThemeGlobalStyles(tmpDir)
    expect(css).toBe('')
  })

  it('should prefer styles/ directory over legacy style.css', async () => {
    const stylesDir = path.join(tmpDir, 'styles')
    await fs.mkdir(stylesDir)
    await fs.writeFile(path.join(stylesDir, 'tokens.css'), ':root { --t-color-bg: #new; }')
    await fs.writeFile(path.join(tmpDir, 'style.css'), ':root { --old: legacy; }')

    const css = await loadThemeGlobalStyles(tmpDir)
    expect(css).toContain('--t-color-bg: #new')
    expect(css).not.toContain('--old')
  })
})

// ── Full Build Integration ──

describe('buildStyles', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'titan-buildstyles-'))
    const stylesDir = path.join(tmpDir, 'styles')
    await fs.mkdir(stylesDir)

    // Create a theme with all tokens assigned
    const tokenLines = DESIGN_TOKENS.map(t => `  ${t}: test-value;`).join('\n')
    await fs.writeFile(
      path.join(stylesDir, 'tokens.css'),
      `:root {\n${tokenLines}\n}`,
    )
    await fs.writeFile(
      path.join(stylesDir, 'global.css'),
      'body { font-family: var(--t-font-sans); }',
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should build all 5 layers', async () => {
    const result = await buildStyles({
      themeDir: tmpDir,
      themeName: 'test-theme',
      plugins: [],
      rootDir: tmpDir,
    })

    expect(result.css).toContain('Layer 1: Titan Base')
    expect(result.css).toContain('Layer 2: Theme Global')
    expect(result.css).toContain('box-sizing: border-box')
    expect(result.css).toContain('font-family: var(--t-font-sans)')
    expect(result.warnings).toHaveLength(0)
  })

  it('should include user token overrides', async () => {
    const result = await buildStyles({
      themeDir: tmpDir,
      themeName: 'test-theme',
      plugins: [],
      userStyles: {
        tokens: { '--t-color-accent': '#e11d48' },
      },
      rootDir: tmpDir,
    })

    expect(result.css).toContain('Layer 5: User Overrides')
    expect(result.css).toContain('--t-color-accent: #e11d48')
  })

  it('should produce warnings for plugin CSS violations', async () => {
    const result = await buildStyles({
      themeDir: tmpDir,
      themeName: 'test-theme',
      plugins: [
        { name: 'bad-plugin', slotStyles: '.card { color: #ff0000; }' },
      ],
      rootDir: tmpDir,
    })

    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.includes('bad-plugin'))).toBe(true)
  })

  it('should scope plugin CSS class names', async () => {
    const result = await buildStyles({
      themeDir: tmpDir,
      themeName: 'test-theme',
      plugins: [
        { name: '@titan/plugin-comments', slotStyles: '.container { display: flex; }' },
      ],
      rootDir: tmpDir,
    })

    expect(result.css).toContain('titan-comments__container_')
  })

  it('should warn when theme is missing tokens', async () => {
    // Overwrite with incomplete tokens
    await fs.writeFile(
      path.join(tmpDir, 'styles', 'tokens.css'),
      ':root { --t-color-bg: #fff; }',
    )

    const result = await buildStyles({
      themeDir: tmpDir,
      themeName: 'incomplete-theme',
      plugins: [],
      rootDir: tmpDir,
    })

    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => w.includes('incomplete-theme'))).toBe(true)
    expect(result.warnings.some(w => w.includes('--t-color-text'))).toBe(true)
  })
})

// ── Design Token Registry ──

describe('DESIGN_TOKENS', () => {
  it('should contain all expected token categories', () => {
    const tokens = [...DESIGN_TOKENS]
    expect(tokens.some(t => t.startsWith('--t-color-'))).toBe(true)
    expect(tokens.some(t => t.startsWith('--t-font-'))).toBe(true)
    expect(tokens.some(t => t.startsWith('--t-text-'))).toBe(true)
    expect(tokens.some(t => t.startsWith('--t-space-'))).toBe(true)
    expect(tokens.some(t => t.startsWith('--t-radius-'))).toBe(true)
    expect(tokens.some(t => t.startsWith('--t-shadow-'))).toBe(true)
    expect(tokens.some(t => t.startsWith('--t-z-'))).toBe(true)
  })

  it('should all start with --t-', () => {
    for (const token of DESIGN_TOKENS) {
      expect(token.startsWith('--t-')).toBe(true)
    }
  })
})
