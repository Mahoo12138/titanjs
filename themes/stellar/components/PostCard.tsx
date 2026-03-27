/**
 * PostCard — Article card for listing pages
 */

export function PostCard({ post }: { post: any }) {
  const dateStr = post.date
    ? new Date(post.date).toISOString().split('T')[0]
    : ''

  return (
    <article class="post-card">
      <a class="post-card-link" href={post.url}>
        <h2 class="post-card-title">{post.title}</h2>
        <div class="post-card-meta">
          {dateStr && <time>{dateStr}</time>}
          {post.readingTime && (
            <span class="reading-time"> · {post.readingTime} min</span>
          )}
        </div>
        {post.excerpt && (
          <p class="post-card-excerpt">{post.excerpt}</p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div class="post-card-tags">
            {post.tags.map((tag: any) => (
              <span key={tag.slug} class="tag">#{tag.name}</span>
            ))}
          </div>
        )}
      </a>
    </article>
  )
}
