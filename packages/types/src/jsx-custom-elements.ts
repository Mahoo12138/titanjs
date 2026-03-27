/**
 * Global JSX custom-element support for Titan themes.
 *
 * Augments Preact's IntrinsicElements with a catch-all index signature
 * so theme authors can use arbitrary custom HTML elements (e.g. <widget>,
 * <post-list>) in JSX without needing per-tag declarations.
 *
 * This file is auto-included by TypeScript when the theme's tsconfig
 * references @titan/types (via the package.json "types" field).
 */
declare module 'preact/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: preact.JSX.HTMLAttributes<HTMLElement>
    }
  }
}

export {}
