import { Slot } from '@titan/core'

/**
 * Post layout — renders a single blog post with slot injection points.
 */
export default function PostLayout(ctx) {
  const { site, post } = ctx

  return (
    <div class="titan-layout">
      <header class="titan-header">
        <nav><a href="/">← {site.title}</a></nav>
      </header>

      <article class="titan-article">
        <h1>{post.title}</h1>

        <div class="post-meta">
          <time>{post.date.toISOString().split('T')[0]}</time>
          {post.readingTime && <span> · {post.readingTime} min read</span>}
        </div>

        {post.tags && post.tags.length > 0 && (
          <div class="post-tags">
            {post.tags.map(tag => (
              <a key={tag.slug} href={`/tags/${tag.slug}/`}>#{tag.name}</a>
            ))}
          </div>
        )}

        <Slot name="post:before-content" props={{ post, site }} />

        <div class="titan-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

        <Slot name="post:after-content" props={{ post, site }} />
      </article>

      {(post.prev || post.next) && (
        <nav class="post-nav">
          {post.prev && <a href={post.prev.url}>← {post.prev.title}</a>}
          {post.next && <a href={post.next.url}>{post.next.title} →</a>}
        </nav>
      )}

      <footer class="titan-footer">
        <Slot name="footer" props={{ site }} />
        <p>Powered by TitanJS</p>
      </footer>
    </div>
  )
}
