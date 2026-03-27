/**
 * Default layout — used for index pages and any content without a specific layout.
 */
export default function DefaultLayout(ctx) {
  const { site, posts = [] } = ctx

  return (
    <div class="titan-layout">
      <header class="titan-header">
        <h1><a href="/">{site.title}</a></h1>
      </header>

      <main class="titan-main">
        {posts.length > 0 ? (
          <ul class="post-list">
            {posts.map(post => (
              <li key={post.slug}>
                <time>{post.date.toISOString().split('T')[0]}</time>
                <a href={post.url}>{post.title}</a>
                {post.excerpt && <p class="excerpt">{post.excerpt}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p>No posts yet.</p>
        )}
      </main>

      <footer class="titan-footer">
        <p>Powered by TitanJS</p>
      </footer>
    </div>
  )
}
