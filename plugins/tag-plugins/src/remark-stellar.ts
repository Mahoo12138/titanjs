/**
 * remark-stellar - Transform remark-directive nodes into Stellar-style HTML.
 *
 * Requires `remark-directive` to run before this plugin in the pipeline
 * so that :::, ::, and : syntaxes produce directive AST nodes.
 *
 * Container directives  (:::name)  → note, box, tabs, timeline, folding, grid
 * Leaf directives       (::name)   → image, link, button, copy
 * Inline/text directives (:name)   → mark, hashtag, icon, badge, kbd, sup, sub, checkbox
 */
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

// ── Minimal AST node types (avoids depending on `mdast` types package) ──

interface MdastNode {
  type: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

type Root = { type: 'root'; children: MdastNode[] }

// ── mdast-directive node types (declared by remark-directive) ──

interface DirectiveNode extends MdastNode {
  name: string
  attributes: Record<string, string | undefined>
  children: MdastNode[]
}

interface ContainerDirective extends DirectiveNode {
  type: 'containerDirective'
}

interface LeafDirective extends DirectiveNode {
  type: 'leafDirective'
}

interface TextDirective extends DirectiveNode {
  type: 'textDirective'
}

type AnyDirective = ContainerDirective | LeafDirective | TextDirective

// ── helpers ──

function hast(
  node: DirectiveNode,
  tagName: string,
  properties: Record<string, unknown> = {},
) {
  node.data ??= {}
  node.data.hName = tagName
  node.data.hProperties = properties
}

function classes(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ── Container handlers ──

function handleNote(node: ContainerDirective) {
  const color = node.attributes.color ?? 'blue'
  const title = node.attributes.title
  hast(node, 'div', {
    className: classes('tag-plugin', 'tag-note', `tag-note--${color}`),
    'data-color': color,
  })
  // If a title is given, prepend a title child element
  if (title) {
    const titleNode: DirectiveNode = {
      type: 'containerDirective',
      name: '_title',
      attributes: {},
      children: [{ type: 'text', value: title } as any],
    }
    hast(titleNode, 'div', { className: 'tag-note__title' })
    node.children.unshift(titleNode as any)
  }
}

function handleBox(node: ContainerDirective) {
  // box is an alias for note with slightly different styling
  const color = node.attributes.color ?? 'blue'
  const title = node.attributes.title
  hast(node, 'div', {
    className: classes('tag-plugin', 'tag-box', `tag-box--${color}`),
  })
  if (title) {
    const titleNode: DirectiveNode = {
      type: 'containerDirective',
      name: '_title',
      attributes: {},
      children: [{ type: 'text', value: title } as any],
    }
    hast(titleNode, 'div', { className: 'tag-box__title' })
    node.children.unshift(titleNode as any)
  }
}

function handleTabs(node: ContainerDirective) {
  hast(node, 'div', {
    className: classes('tag-plugin', 'tag-tabs'),
  })

  // Each child ::tab becomes a panel
  let tabIndex = 0
  for (const child of node.children) {
    const c = child as unknown as AnyDirective
    if (
      (c.type === 'leafDirective' || c.type === 'containerDirective') &&
      c.name === 'tab'
    ) {
      const active = tabIndex === 0
      hast(c, 'div', {
        className: classes('tag-tabs__panel', active && 'tag-tabs__panel--active'),
        'data-tab-title': c.attributes.title ?? `Tab ${tabIndex + 1}`,
        'data-tab-index': String(tabIndex),
      })
      tabIndex++
    }
  }
}

function handleTimeline(node: ContainerDirective) {
  hast(node, 'div', {
    className: classes('tag-plugin', 'tag-timeline'),
  })

  for (const child of node.children) {
    const c = child as unknown as AnyDirective
    if (
      (c.type === 'leafDirective' || c.type === 'containerDirective') &&
      c.name === 'node'
    ) {
      const title = c.attributes.title ?? ''
      const color = c.attributes.color
      hast(c, 'div', {
        className: classes('tag-timeline__node', color && `tag-timeline__node--${color}`),
        'data-title': title,
      })
      // Prepend a title element
      if (title) {
        const titleNode: DirectiveNode = {
          type: 'containerDirective',
          name: '_title',
          attributes: {},
          children: [{ type: 'text', value: title } as any],
        }
        hast(titleNode, 'div', { className: 'tag-timeline__title' })
        c.children.unshift(titleNode as any)
      }
    }
  }
}

function handleFolding(node: ContainerDirective) {
  const title = node.attributes.title ?? 'Details'
  const open = node.attributes.open !== undefined

  // Wrap content in <details><summary>
  hast(node, 'details', {
    className: classes('tag-plugin', 'tag-folding'),
    ...(open && { open: true }),
  })

  // Prepend <summary>
  const summaryNode: DirectiveNode = {
    type: 'containerDirective',
    name: '_summary',
    attributes: {},
    children: [{ type: 'text', value: title } as any],
  }
  hast(summaryNode, 'summary', { className: 'tag-folding__summary' })
  node.children.unshift(summaryNode as any)
}

function handleGrid(node: ContainerDirective) {
  const cols = node.attributes.cols ?? '2'
  hast(node, 'div', {
    className: classes('tag-plugin', 'tag-grid'),
    style: `--tag-grid-cols: ${cols}`,
  })

  // Each child ::cell becomes a grid cell
  for (const child of node.children) {
    const c = child as unknown as AnyDirective
    if (
      (c.type === 'leafDirective' || c.type === 'containerDirective') &&
      c.name === 'cell'
    ) {
      const span = c.attributes.span
      hast(c, 'div', {
        className: 'tag-grid__cell',
        ...(span && { style: `grid-column: span ${span}` }),
      })
    }
  }
}

// ── Leaf handlers ──

function handleImage(node: LeafDirective) {
  const src = node.attributes.src ?? ''
  const alt = node.attributes.alt ?? ''
  const caption = node.attributes.caption
  const width = node.attributes.width

  if (caption) {
    hast(node, 'figure', {
      className: classes('tag-plugin', 'tag-image'),
    })
    // Replace children with img + figcaption
    node.children = [
      {
        type: 'leafDirective',
        name: '_img',
        attributes: {},
        children: [],
        data: { hName: 'img', hProperties: { src, alt, ...(width && { width }) } },
      } as any,
      {
        type: 'leafDirective',
        name: '_caption',
        attributes: {},
        children: [{ type: 'text', value: caption } as any],
        data: { hName: 'figcaption', hProperties: {} },
      } as any,
    ]
  } else {
    hast(node, 'img', {
      className: classes('tag-plugin', 'tag-image'),
      src,
      alt,
      ...(width && { width }),
    })
  }
}

function handleLink(node: LeafDirective) {
  const href = node.attributes.href ?? ''
  const title = node.attributes.title ?? href
  const desc = node.attributes.desc
  const icon = node.attributes.icon

  hast(node, 'a', {
    className: classes('tag-plugin', 'tag-link'),
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
  })

  const children: MdastNode[] = []
  if (icon) {
    children.push({
      type: 'leafDirective',
      name: '_icon',
      attributes: {},
      children: [],
      data: { hName: 'i', hProperties: { className: `tag-link__icon ${icon}` } },
    } as any)
  }
  children.push({
    type: 'leafDirective',
    name: '_title',
    attributes: {},
    children: [{ type: 'text', value: title } as any],
    data: { hName: 'span', hProperties: { className: 'tag-link__title' } },
  } as any)
  if (desc) {
    children.push({
      type: 'leafDirective',
      name: '_desc',
      attributes: {},
      children: [{ type: 'text', value: desc } as any],
      data: { hName: 'span', hProperties: { className: 'tag-link__desc' } },
    } as any)
  }
  node.children = children
}

function handleButton(node: LeafDirective) {
  const href = node.attributes.href ?? '#'
  const text = node.attributes.text ?? node.attributes.title ?? 'Button'
  const color = node.attributes.color ?? 'default'
  const size = node.attributes.size ?? 'md'
  const icon = node.attributes.icon

  hast(node, 'a', {
    className: classes('tag-plugin', 'tag-button', `tag-button--${color}`, `tag-button--${size}`),
    href,
  })

  const children: MdastNode[] = []
  if (icon) {
    children.push({
      type: 'leafDirective',
      name: '_icon',
      attributes: {},
      children: [],
      data: { hName: 'i', hProperties: { className: icon } },
    } as any)
  }
  children.push({ type: 'text', value: text } as any)
  node.children = children
}

function handleCopy(node: LeafDirective) {
  const text = node.attributes.text ?? node.attributes.code ?? ''
  hast(node, 'span', {
    className: classes('tag-plugin', 'tag-copy'),
    'data-clipboard-text': text,
    role: 'button',
    tabindex: '0',
  })
  node.children = [
    {
      type: 'leafDirective',
      name: '_code',
      attributes: {},
      children: [{ type: 'text', value: text } as any],
      data: { hName: 'code', hProperties: {} },
    } as any,
    {
      type: 'leafDirective',
      name: '_btn',
      attributes: {},
      children: [],
      data: { hName: 'span', hProperties: { className: 'tag-copy__btn', 'aria-label': 'Copy' } },
    } as any,
  ]
}

// ── Inline (text) handlers ──

function handleMark(node: TextDirective) {
  const color = node.attributes.color ?? 'yellow'
  hast(node, 'mark', {
    className: classes('tag-plugin', 'tag-mark', `tag-mark--${color}`),
  })
}

function handleHashtag(node: TextDirective) {
  const tag = node.children.length > 0 ? null : node.attributes.tag
  hast(node, 'span', {
    className: classes('tag-plugin', 'tag-hashtag'),
    ...(tag && { 'data-tag': tag }),
  })
}

function handleIcon(node: TextDirective) {
  const name = node.attributes.name ?? node.attributes.class ?? ''
  hast(node, 'i', {
    className: classes('tag-plugin', 'tag-icon', name),
    'aria-hidden': 'true',
  })
}

function handleBadge(node: TextDirective) {
  const color = node.attributes.color ?? 'blue'
  hast(node, 'span', {
    className: classes('tag-plugin', 'tag-badge', `tag-badge--${color}`),
  })
}

function handleKbd(node: TextDirective) {
  hast(node, 'kbd', { className: 'tag-plugin tag-kbd' })
}

function handleSup(node: TextDirective) {
  hast(node, 'sup', { className: 'tag-plugin tag-sup' })
}

function handleSub(node: TextDirective) {
  hast(node, 'sub', { className: 'tag-plugin tag-sub' })
}

function handleCheckbox(node: TextDirective) {
  const checked = node.attributes.checked !== undefined
  hast(node, 'span', {
    className: classes('tag-plugin', 'tag-checkbox', checked && 'tag-checkbox--checked'),
  })
  // Prepend a visual checkbox element
  const checkboxInput: DirectiveNode = {
    type: 'textDirective',
    name: '_input',
    attributes: {},
    children: [],
    data: {
      hName: 'input',
      hProperties: {
        type: 'checkbox',
        disabled: true,
        ...(checked && { checked: true }),
      },
    },
  }
  node.children.unshift(checkboxInput as any)
}

// ── Dispatch maps ──

const containerHandlers: Record<string, (node: ContainerDirective) => void> = {
  note: handleNote,
  box: handleBox,
  tabs: handleTabs,
  timeline: handleTimeline,
  folding: handleFolding,
  grid: handleGrid,
}

const leafHandlers: Record<string, (node: LeafDirective) => void> = {
  image: handleImage,
  link: handleLink,
  button: handleButton,
  copy: handleCopy,
}

const textHandlers: Record<string, (node: TextDirective) => void> = {
  mark: handleMark,
  hashtag: handleHashtag,
  icon: handleIcon,
  badge: handleBadge,
  kbd: handleKbd,
  sup: handleSup,
  sub: handleSub,
  checkbox: handleCheckbox,
}

// ── The remark plugin ──

export interface StellarDirectivesOptions {
  /** Additional container directive handlers */
  containers?: Record<string, (node: ContainerDirective) => void>
  /** Additional leaf directive handlers */
  leaves?: Record<string, (node: LeafDirective) => void>
  /** Additional text directive handlers */
  texts?: Record<string, (node: TextDirective) => void>
}

export const remarkStellarDirectives: Plugin<[StellarDirectivesOptions?], Root> =
  function (options: StellarDirectivesOptions = {}) {
    const containers = { ...containerHandlers, ...options.containers }
    const leaves = { ...leafHandlers, ...options.leaves }
    const texts = { ...textHandlers, ...options.texts }

    return (tree: Root) => {
      visit(tree as any, (node: MdastNode) => {
        switch (node.type) {
          case 'containerDirective': {
            const d = node as unknown as ContainerDirective
            containers[d.name]?.(d)
            break
          }
          case 'leafDirective': {
            const d = node as unknown as LeafDirective
            leaves[d.name]?.(d)
            break
          }
          case 'textDirective': {
            const d = node as unknown as TextDirective
            texts[d.name]?.(d)
            break
          }
        }
      })
    }
  }
