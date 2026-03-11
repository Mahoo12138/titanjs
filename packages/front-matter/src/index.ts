/**
 * @neo-hexo/front-matter — Front-matter parser
 *
 * Extracts YAML, JSON, or TOML front-matter from markdown files.
 * Zero external dependencies for YAML parsing (uses built-in heuristic parser).
 * For full YAML spec compliance, integrate `js-yaml` as an optional peer dependency.
 *
 * Supports:
 *   - YAML between `---` delimiters (default)
 *   - JSON between `;;;` delimiters or `---json` / `---`
 *   - TOML between `+++` delimiters
 *   - Excerpt separated by `<!-- more -->` marker
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FrontMatterResult<T = Record<string, unknown>> {
  /** Parsed front-matter data. */
  data: T;
  /** Content after front-matter (without the excerpt marker). */
  content: string;
  /** Excerpt (content before the <!-- more --> marker). Empty string if none. */
  excerpt: string;
  /** Raw front-matter string (unparsed). */
  raw: string;
}

export interface ParseOptions {
  /** Custom excerpt separator (default: '<!-- more -->'). */
  excerptSeparator?: string;
  /** Custom YAML parser (e.g., js-yaml's load function). */
  yamlParser?: (str: string) => unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const YAML_FENCE = '---';
const JSON_FENCE = ';;;';
const TOML_FENCE = '+++';
const DEFAULT_EXCERPT_SEP = '<!-- more -->';

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a string containing front-matter.
 *
 * @example
 * ```ts
 * const result = parse(`---
 * title: Hello World
 * date: 2024-01-15
 * ---
 *
 * This is the content.
 *
 * <!-- more -->
 *
 * More content here.
 * `);
 *
 * result.data   // { title: 'Hello World', date: '2024-01-15' }
 * result.content // 'This is the content.\n\n<!-- more -->\n\nMore content here.\n'
 * result.excerpt // 'This is the content.'
 * ```
 */
export function parse<T = Record<string, unknown>>(
  input: string,
  options: ParseOptions = {},
): FrontMatterResult<T> {
  const { excerptSeparator = DEFAULT_EXCERPT_SEP, yamlParser } = options;

  // Normalize line endings
  const str = input.replace(/\r\n/g, '\n');

  // Try each format
  const yaml = tryExtract(str, YAML_FENCE, YAML_FENCE);
  if (yaml) {
    const data = parseYaml(yaml.raw, yamlParser) as T;
    const { content, excerpt } = splitExcerpt(yaml.content, excerptSeparator);
    return { data, content, excerpt, raw: yaml.raw };
  }

  const json = tryExtract(str, JSON_FENCE, JSON_FENCE);
  if (json) {
    const data = JSON.parse(json.raw) as T;
    const { content, excerpt } = splitExcerpt(json.content, excerptSeparator);
    return { data, content, excerpt, raw: json.raw };
  }

  const toml = tryExtract(str, TOML_FENCE, TOML_FENCE);
  if (toml) {
    // TOML parsing requires an external library — store raw for now
    const data = parseSimpleToml(toml.raw) as T;
    const { content, excerpt } = splitExcerpt(toml.content, excerptSeparator);
    return { data, content, excerpt, raw: toml.raw };
  }

  // No front-matter found
  const { content, excerpt } = splitExcerpt(str, excerptSeparator);
  return { data: {} as T, content, excerpt, raw: '' };
}

/**
 * Stringify front-matter data and content into a file string.
 */
export function stringify(
  data: Record<string, unknown>,
  content: string,
  format: 'yaml' | 'json' = 'yaml',
): string {
  let frontMatter: string;

  if (format === 'json') {
    frontMatter = [JSON_FENCE, JSON.stringify(data, null, 2), JSON_FENCE].join('\n');
  } else {
    frontMatter = [YAML_FENCE, stringifyYaml(data).trimEnd(), YAML_FENCE].join('\n');
  }

  return `${frontMatter}\n${content}`;
}

// ─── Internal: Extract front-matter block ────────────────────────────────────

interface ExtractResult {
  raw: string;
  content: string;
}

function tryExtract(str: string, openFence: string, closeFence: string): ExtractResult | null {
  // Must start with the fence (optionally with trailing whitespace)
  if (!str.startsWith(openFence)) return null;

  const afterOpen = str.indexOf('\n', openFence.length);
  if (afterOpen === -1) return null;

  // Check nothing meaningful is on the opening fence line
  const fenceLine = str.slice(openFence.length, afterOpen).trim();
  if (fenceLine !== '' && fenceLine !== 'json' && fenceLine !== 'yaml' && fenceLine !== 'toml') {
    return null;
  }

  // Find closing fence
  const closeIdx = str.indexOf(`\n${closeFence}`, afterOpen);
  if (closeIdx === -1) return null;

  const raw = str.slice(afterOpen + 1, closeIdx);
  const afterClose = str.indexOf('\n', closeIdx + 1);
  const content = afterClose === -1 ? '' : str.slice(afterClose + 1);

  return { raw, content: content.replace(/^\n+/, '') };
}

// ─── Internal: Excerpt splitting ─────────────────────────────────────────────

function splitExcerpt(content: string, separator: string): { content: string; excerpt: string } {
  const idx = content.indexOf(separator);
  if (idx === -1) return { content, excerpt: '' };

  const excerpt = content.slice(0, idx).trim();
  return { content, excerpt };
}

// ─── Internal: Simple YAML Parser ────────────────────────────────────────────

/**
 * Minimal YAML parser that handles common front-matter patterns:
 * - Key-value pairs (scalars, strings, numbers, booleans)
 * - Simple arrays (- item notation)
 * - Quoted strings
 *
 * For full YAML spec, provide a yamlParser option (e.g., js-yaml).
 */
function parseYaml(raw: string, customParser?: (str: string) => unknown): Record<string, unknown> {
  if (customParser) return customParser(raw) as Record<string, unknown>;

  const result: Record<string, unknown> = {};
  const lines = raw.split('\n');
  let currentKey = '';
  let arrayMode = false;
  let currentArray: unknown[] = [];

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      if (arrayMode) continue;
      continue;
    }

    // Array item
    const arrayMatch = line.match(/^\s+-\s+(.*)/);
    if (arrayMatch && currentKey) {
      if (!arrayMode) {
        arrayMode = true;
        currentArray = [];
      }
      currentArray.push(parseYamlValue(arrayMatch[1]!.trim()));
      result[currentKey] = currentArray;
      continue;
    }

    // Flush any pending array
    if (arrayMode) {
      arrayMode = false;
      currentArray = [];
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w\s]*?):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1]!.trim();
      const value = kvMatch[2]!.trim();

      if (value === '') {
        // Could be start of an array or nested object
        result[currentKey] = null;
      } else {
        result[currentKey] = parseYamlValue(value);
      }
    }
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  // Quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Booleans
  if (value === 'true' || value === 'True' || value === 'TRUE') return true;
  if (value === 'false' || value === 'False' || value === 'FALSE') return false;

  // Null
  if (value === 'null' || value === 'Null' || value === '~') return null;

  // Numbers
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // Inline array [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => parseYamlValue(s.trim()));
  }

  return value;
}

// ─── Internal: Simple YAML Stringifier ───────────────────────────────────────

function stringifyYaml(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${yamlScalar(item)}`);
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${key}:`);
      for (const [k, v] of Object.entries(value)) {
        lines.push(`  ${k}: ${yamlScalar(v)}`);
      }
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }

  return lines.join('\n') + '\n';
}

function yamlScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    // Quote if contains special characters
    if (/[:#{}[\],&*?|>!%@`]/.test(value) || value === '' || value.includes('\n')) {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return value;
  }
  return String(value);
}

// ─── Internal: Simple TOML Parser ────────────────────────────────────────────

/**
 * Minimal TOML parser for common front-matter use cases.
 * Handles basic key = value pairs. For full spec, use `smol-toml`.
 */
function parseSimpleToml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    result[key] = parseTomlValue(value);
  }

  return result;
}

function parseTomlValue(value: string): unknown {
  // Quoted strings
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Numbers
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // Arrays
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((s) => parseTomlValue(s.trim()));
  }

  return value;
}
