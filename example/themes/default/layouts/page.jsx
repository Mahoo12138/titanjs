/*
 * @Author: mahoo12138 mahoo12138@qq.com
 * @Date: 2026-04-08 11:56:49
 * @LastEditors: mahoo12138 mahoo12138@qq.com
 * @LastEditTime: 2026-04-08 13:58:17
 * @FilePath: /titanjs/example/themes/default/layouts/page.jsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * Page layout — renders a standalone page (about, contact, etc.)
 */
export default function PageLayout(ctx) {
  const { site, page } = ctx;

  return (
    <div class="titan-layout">
      <header class="titan-header">
        <nav>
          <a href="/">← {site.title}</a>
        </nav>
      </header>

      <article class="titan-article">
        <h1>{page.title}</h1>
        <div
          class="titan-prose"
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      </article>

      <footer class="titan-footer">
        <p>Powered by TitanJS</p>
      </footer>
    </div>
  );
}
