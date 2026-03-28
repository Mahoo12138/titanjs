/**
 * NavTabs — Blog section navigation tabs
 *
 * Renders tabs: 文章 / 分类 / 标签 / 归档
 */

const TABS = [
  { label: '文章', href: '/' },
  { label: '分类', href: '/categories/' },
  { label: '标签', href: '/tags/' },
  { label: '归档', href: '/archives/' },
]

export function NavTabs({ current }: { current: string }) {
  return (
    <nav class="nav-tabs">
      <div class="nav-tabs-inner">
        {TABS.map((tab) => (
          <a
            key={tab.href}
            class={`nav-tab${current === tab.href ? ' active' : ''}`}
            href={tab.href}
          >
            {tab.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
