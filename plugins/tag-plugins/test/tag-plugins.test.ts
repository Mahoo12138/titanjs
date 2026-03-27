import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkDirective from 'remark-directive'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { pluginTagPlugins } from '../src/plugin.js'
import { remarkStellarDirectives } from '../src/remark-stellar.js'

/** Helper: markdown → HTML via the full remark pipeline */
async function render(md: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkStellarDirectives)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(md)
  return String(result)
}

// ── Plugin factory ──

describe('pluginTagPlugins', () => {
  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginTagPlugins()
    expect(plugin.name).toBe('@titan/plugin-tag-plugins')
  })

  it('should provide remarkPlugins', () => {
    const plugin = pluginTagPlugins()
    expect(plugin.remarkPlugins).toBeDefined()
    expect(plugin.remarkPlugins!.length).toBe(2)
  })
})

// ── Container: note ──

describe('note', () => {
  it('should render a note block', async () => {
    const html = await render(':::note\nHello world\n:::')
    expect(html).toContain('tag-note')
    expect(html).toContain('tag-note--blue')
    expect(html).toContain('Hello world')
  })

  it('should accept color attribute', async () => {
    const html = await render(':::note{color=red}\nDanger!\n:::')
    expect(html).toContain('tag-note--red')
  })

  it('should render a title when provided', async () => {
    const html = await render(':::note{title="提示"}\nContent\n:::')
    expect(html).toContain('tag-note__title')
    expect(html).toContain('提示')
  })
})

// ── Container: box ──

describe('box', () => {
  it('should render a box block', async () => {
    const html = await render(':::box{color=green}\nInfo\n:::')
    expect(html).toContain('tag-box')
    expect(html).toContain('tag-box--green')
  })
})

// ── Container: tabs ──

describe('tabs', () => {
  it('should render tabs with panels', async () => {
    const md = `:::tabs
::tab{title="Tab A"}
Content A
::tab{title="Tab B"}
Content B
:::`
    const html = await render(md)
    expect(html).toContain('tag-tabs')
    expect(html).toContain('tag-tabs__panel')
    expect(html).toContain('data-tab-title="Tab A"')
    expect(html).toContain('data-tab-title="Tab B"')
  })

  it('should set first tab as active', async () => {
    const md = `:::tabs
::tab{title="First"}
First content
::tab{title="Second"}
Second content
:::`
    const html = await render(md)
    expect(html).toContain('tag-tabs__panel--active')
  })
})

// ── Container: timeline ──

describe('timeline', () => {
  it('should render timeline with nodes', async () => {
    const md = `:::timeline
::node{title="Step 1"}
Did something
::node{title="Step 2" color=green}
Did more
:::`
    const html = await render(md)
    expect(html).toContain('tag-timeline')
    expect(html).toContain('tag-timeline__node')
    expect(html).toContain('tag-timeline__node--green')
    expect(html).toContain('Step 1')
  })
})

// ── Container: folding ──

describe('folding', () => {
  it('should render a details/summary element', async () => {
    const html = await render(':::folding{title="Click me"}\nHidden content\n:::')
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('tag-folding')
    expect(html).toContain('Click me')
  })

  it('should support open attribute', async () => {
    const html = await render(':::folding{title="Open" open}\nVisible\n:::')
    expect(html).toContain('open')
  })
})

// ── Container: grid ──

describe('grid', () => {
  it('should render a grid with cells', async () => {
    const md = `:::grid{cols=3}
::cell
Cell 1
::cell{span=2}
Cell 2
:::`
    const html = await render(md)
    expect(html).toContain('tag-grid')
    expect(html).toContain('--tag-grid-cols: 3')
    expect(html).toContain('tag-grid__cell')
  })
})

// ── Leaf: image ──

describe('image', () => {
  it('should render an image with caption', async () => {
    const html = await render('::image{src="/photo.jpg" alt="Photo" caption="A photo"}')
    expect(html).toContain('<figure')
    expect(html).toContain('tag-image')
    expect(html).toContain('src="/photo.jpg"')
    expect(html).toContain('<figcaption')
    expect(html).toContain('A photo')
  })

  it('should render a plain image without caption', async () => {
    const html = await render('::image{src="/pic.png" alt="Pic"}')
    expect(html).toContain('tag-image')
    expect(html).toContain('src="/pic.png"')
  })
})

// ── Leaf: link ──

describe('link', () => {
  it('should render a link card', async () => {
    const html = await render('::link{href="https://example.com" title="Example" desc="A website"}')
    expect(html).toContain('tag-link')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('tag-link__title')
    expect(html).toContain('Example')
    expect(html).toContain('tag-link__desc')
  })
})

// ── Leaf: button ──

describe('button', () => {
  it('should render a button', async () => {
    const html = await render('::button{href="/go" text="Go" color=green}')
    expect(html).toContain('tag-button')
    expect(html).toContain('tag-button--green')
    expect(html).toContain('Go')
  })
})

// ── Leaf: copy ──

describe('copy', () => {
  it('should render a copyable element', async () => {
    const html = await render('::copy{text="npm install titan"}')
    expect(html).toContain('tag-copy')
    expect(html).toContain('data-clipboard-text="npm install titan"')
    expect(html).toContain('npm install titan')
  })
})

// ── Inline: mark ──

describe('mark', () => {
  it('should render highlighted text', async () => {
    const html = await render('This is :mark[important]{color=red} text.')
    expect(html).toContain('<mark')
    expect(html).toContain('tag-mark')
    expect(html).toContain('tag-mark--red')
    expect(html).toContain('important')
  })

  it('should default to yellow', async () => {
    const html = await render(':mark[test]')
    expect(html).toContain('tag-mark--yellow')
  })
})

// ── Inline: hashtag ──

describe('hashtag', () => {
  it('should render a hashtag', async () => {
    const html = await render(':hashtag[TypeScript]')
    expect(html).toContain('tag-hashtag')
    expect(html).toContain('TypeScript')
  })
})

// ── Inline: badge ──

describe('badge', () => {
  it('should render a colored badge', async () => {
    const html = await render(':badge[v2.0]{color=green}')
    expect(html).toContain('tag-badge')
    expect(html).toContain('tag-badge--green')
    expect(html).toContain('v2.0')
  })
})

// ── Inline: kbd ──

describe('kbd', () => {
  it('should render a keyboard shortcut', async () => {
    const html = await render('Press :kbd[Ctrl+C] to copy.')
    expect(html).toContain('<kbd')
    expect(html).toContain('Ctrl+C')
  })
})

// ── Inline: checkbox ──

describe('checkbox', () => {
  it('should render an unchecked checkbox', async () => {
    const html = await render(':checkbox[Buy milk]')
    expect(html).toContain('tag-checkbox')
    expect(html).toContain('Buy milk')
    expect(html).toContain('type="checkbox"')
  })

  it('should render a checked checkbox', async () => {
    const html = await render(':checkbox[Done]{checked}')
    expect(html).toContain('tag-checkbox--checked')
  })
})

// ── Custom handlers ──

describe('custom handlers', () => {
  it('should accept additional container handlers', async () => {
    const result = await unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(remarkStellarDirectives, {
        containers: {
          custom(node: any) {
            node.data ??= {}
            node.data.hName = 'div'
            node.data.hProperties = { className: 'my-custom' }
          },
        },
      })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .process(':::custom\nStuff\n:::')

    expect(String(result)).toContain('my-custom')
  })
})
