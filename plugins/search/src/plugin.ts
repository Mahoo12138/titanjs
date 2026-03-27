/**
 * Search plugin factory
 *
 * Two integration points:
 *   1. `generate:after` hook — write search-index.json to the output
 *   2. `emit:after` hook — inject search UI island + stylesheet into every page
 */
import { h } from 'preact'
import path from 'node:path'
import fs from 'node:fs/promises'
import type {
  PluginDefinition,
  GenerateContext,
  EmitContext,
  Post,
} from '@titan/types'

// ── Types ──

export interface SearchOptions {
  /** Fields to include in the index (default: title, excerpt, tags) */
  fields?: ('title' | 'excerpt' | 'tags' | 'content')[]
  /** Max content length stored per entry when `content` is included (default: 5000) */
  maxContentLength?: number
  /** Output path for the index file (default: '/search-index.json') */
  indexPath?: string
  /** Placeholder text for the search input */
  placeholder?: string
  /** Keyboard shortcut to open search (default: '/' ) */
  shortcut?: string
}

export interface SearchIndexEntry {
  title: string
  url: string
  excerpt?: string
  tags?: string[]
  content?: string
}

// ── Helpers ──

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildIndex(
  posts: Post[],
  fields: Set<string>,
  maxContentLength: number,
): SearchIndexEntry[] {
  return posts.map((post) => {
    const entry: SearchIndexEntry = {
      title: post.title,
      url: post.url,
    }
    if (fields.has('excerpt')) {
      entry.excerpt = post.excerpt
    }
    if (fields.has('tags')) {
      entry.tags = post.tags.map((t) => t.name)
    }
    if (fields.has('content')) {
      const plain = stripHtml(post.html)
      entry.content = plain.length > maxContentLength
        ? plain.slice(0, maxContentLength)
        : plain
    }
    return entry
  })
}

// ── Inline search UI styles (injected into <head>) ──

const SEARCH_CSS = `
.titan-search-trigger{position:fixed;top:1rem;right:1rem;z-index:1000;background:var(--t-color-bg,#fff);border:1px solid var(--t-color-border,#e2e8f0);border-radius:.5rem;padding:.4rem .8rem;cursor:pointer;font-size:.875rem;color:var(--t-color-text-muted,#6b7280);display:flex;align-items:center;gap:.3rem;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:border-color .2s}
.titan-search-trigger:hover{border-color:var(--t-color-primary,#4a9eff)}
.titan-search-trigger kbd{font-size:.75em;background:var(--t-color-bg-soft,#f6f8fa);padding:.1em .4em;border-radius:.2em;border:1px solid var(--t-color-border,#d0d7de)}
.titan-search-overlay{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);align-items:flex-start;justify-content:center;padding-top:min(20vh,10rem)}
.titan-search-overlay.open{display:flex}
.titan-search-dialog{background:var(--t-color-bg,#fff);border-radius:.75rem;width:min(90vw,36rem);max-height:70vh;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.12);overflow:hidden}
.titan-search-input{border:none;outline:none;width:100%;padding:1rem 1.25rem;font-size:1rem;background:transparent;border-bottom:1px solid var(--t-color-border,#e2e8f0)}
.titan-search-results{overflow-y:auto;padding:.5rem}
.titan-search-results:empty::after{content:'输入关键词搜索...';display:block;padding:1rem;color:var(--t-color-text-muted,#6b7280);text-align:center}
.titan-search-item{display:block;padding:.6rem 1rem;border-radius:.375rem;text-decoration:none;color:inherit;transition:background .15s}
.titan-search-item:hover,.titan-search-item.active{background:var(--t-color-bg-soft,#f6f8fa)}
.titan-search-item__title{font-weight:600;font-size:.9rem}
.titan-search-item__excerpt{font-size:.8rem;color:var(--t-color-text-muted,#6b7280);margin-top:.15rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
`.trim()

// ── Inline search UI script (client-side) ──

function buildSearchScript(indexPath: string, shortcut: string): string {
  return `
<script type="module">
(async()=>{
  const KEY=${JSON.stringify(shortcut)};
  const INDEX_URL=${JSON.stringify(indexPath)};
  let idx=null;

  // Create trigger button
  const trigger=document.createElement('button');
  trigger.className='titan-search-trigger';
  trigger.innerHTML='<span>搜索</span><kbd>'+KEY+'</kbd>';
  document.body.appendChild(trigger);

  // Create overlay
  const overlay=document.createElement('div');
  overlay.className='titan-search-overlay';
  overlay.innerHTML=\`
    <div class="titan-search-dialog">
      <input class="titan-search-input" type="text" placeholder="搜索文章..." autocomplete="off" />
      <div class="titan-search-results"></div>
    </div>\`;
  document.body.appendChild(overlay);

  const input=overlay.querySelector('.titan-search-input');
  const results=overlay.querySelector('.titan-search-results');

  function open(){overlay.classList.add('open');input.value='';results.innerHTML='';input.focus()}
  function close(){overlay.classList.remove('open')}

  trigger.addEventListener('click',open);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  document.addEventListener('keydown',e=>{
    if(e.key===KEY&&!e.ctrlKey&&!e.metaKey&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA'){e.preventDefault();open()}
    if(e.key==='Escape')close();
  });

  async function loadIndex(){
    if(idx)return idx;
    const r=await fetch(INDEX_URL);
    idx=await r.json();
    return idx;
  }

  function search(q){
    if(!idx||!q.trim())return[];
    const terms=q.toLowerCase().split(/\\s+/).filter(Boolean);
    return idx.filter(item=>{
      const haystack=(item.title+' '+(item.excerpt||'')+' '+(item.tags||[]).join(' ')+' '+(item.content||'')).toLowerCase();
      return terms.every(t=>haystack.includes(t));
    }).slice(0,20);
  }

  function render(items){
    if(!items.length){results.innerHTML='<div style="padding:1rem;text-align:center;color:var(--t-color-text-muted,#999)">无结果</div>';return}
    results.innerHTML=items.map(item=>
      '<a class="titan-search-item" href="'+item.url+'">'+
      '<div class="titan-search-item__title">'+esc(item.title)+'</div>'+
      (item.excerpt?'<div class="titan-search-item__excerpt">'+esc(item.excerpt)+'</div>':'')+
      '</a>'
    ).join('');
  }

  function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

  let timer;
  input.addEventListener('input',()=>{
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      await loadIndex();
      render(search(input.value));
    },150);
  });
})();
</script>`.trim()
}

// ── Plugin factory ──

export function pluginSearch(options: SearchOptions = {}): PluginDefinition {
  const fields = new Set(options.fields ?? ['title', 'excerpt', 'tags'])
  const maxContentLength = options.maxContentLength ?? 5000
  const indexPath = options.indexPath ?? '/search-index.json'
  const shortcut = options.shortcut ?? '/'

  return {
    name: '@titan/plugin-search',

    hooks: {
      // Generate: build and emit the search index JSON
      'generate:after': async (ctx: GenerateContext, next) => {
        await next()

        const posts = ctx.siteData.posts.entries
        const index = buildIndex(posts, fields, maxContentLength)

        // Store on route data so emitter can write it
        ctx.routes.push({
          path: indexPath,
          url: indexPath,
          contentType: 'json',
          layout: '',
          outputPath: indexPath.replace(/^\//, ''),
          type: 'list',
          data: { __searchIndex: JSON.stringify(index) },
        })
      },

      // Emit: write search index + inject search UI into HTML pages
      'emit:after': async (ctx: EmitContext, next) => {
        await next()

        // If this route is the search index, write the JSON
        if (ctx.route.data?.__searchIndex) {
          await fs.mkdir(path.dirname(ctx.outputPath), { recursive: true })
          await fs.writeFile(ctx.outputPath, ctx.route.data.__searchIndex as string, 'utf-8')
          ctx.html = ctx.route.data.__searchIndex as string
          return
        }

        // For HTML pages, inject search CSS + script before </body>
        if (!ctx.html.includes('</body>')) return

        const injection =
          `<style>${SEARCH_CSS}</style>\n` +
          buildSearchScript(indexPath, shortcut)

        ctx.html = ctx.html.replace('</body>', `${injection}\n</body>`)
      },
    },
  }
}
