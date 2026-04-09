# Plan: 将 Hexo Stellar 主题移植到 Titan SSG

## TL;DR
将 Stellar 的 EJS + Hexo 生态移植为 Titan 的 Preact JSX + Plugin 体系。核心：Widget 机制映射为类 Collection 注册 + TS 声明合并，Wiki/Topic/Notebook 映射为自定义 Collection，45+ Tag Plugins 映射为 remark 插件。分 7 阶段递进。

## 阶段零：基础设施 & 类型扩展
- 新建 `packages/types/src/widget.ts`：WidgetDefinition<T>, WidgetRegistry, defineWidget()
- Widget 定义: name, component(Preact), configSchema(Zod), dataLoader?
- TypeScript Declaration Merging 扩展 WidgetMap
- 定义 SidebarDefinition, SiteTree 类型
- 扩展 ThemeDefinition: widgets, siteTree, logo, article, comments
- 新建 `packages/core/src/widget-registry.ts` (类比 CollectionRegistry)
- 集成到 Engine

## 阶段一：主题骨架 & 核心布局
- 创建 themes/stellar/ 主题包
- theme.config.ts: Zod schema 映射 Stellar _config.yml
- Master Layout (default.tsx): Cover + SidebarLeft + main + SidebarRight
- SidebarLeft: Logo → NavMenu → WidgetStack → SocialFooter
- SidebarRight: WidgetStack
- 侧边栏解析链: frontmatter → project override → siteTree
- 基础 widgets: toc, recent, author

## 阶段二：内容页面 & 文章系统
- index.tsx: Blog 列表 + PostCard + Paginator
- post.tsx: header + content + footer + readnext + related + comments slot
- page.tsx: 简化页面
- archive/tag/category.tsx: 聚合页

## 阶段三：Wiki & Notebook（自定义 Collection）
- plugins/wiki/: 注册 wiki Collection, generate 钩子构建 wiki tree, Singleton wikiTree
- Wiki layouts: wiki-index.tsx, wiki.tsx; Widget: tree.tsx
- plugins/notebooks/: 注册 notebooks Collection, 层级标签
- Notebook layouts: notebooks.tsx, notes.tsx, note.tsx; Widget: tagtree.tsx

## 阶段四：Tag Plugins（remark 插件）
- plugins/stellar-tags/: remark-stellar-tags 解析 {% %} 语法
- P0: tabs, note/box, folding, grid, timeline
- P1: image, link, button, icon, mark, hashtag, copy, checkbox
- P2: friends, sites, ghcard
- P3: audio, video, frame, gallery, swiper
- 配套 CSS: styles/tag-plugins.css

## 阶段五：评论 & 搜索 & 第三方集成
- @titan/plugin-comments: Giscus/Waline/Twikoo, Slot post:after-content, Island client:visible
- @titan/plugin-search: 构建索引 + Island Search UI
- Slot 声明: post:after-content, post:sidebar-right, head:extra, footer:extra

## 阶段六：样式系统移植
- tokens.css: Stellar 配色 → --t-* tokens (light + dark)
- global.css: 排版 + 三栏布局 + 响应式
- 组件 CSS Modules (从 Stylus → CSS)
- tag-plugins.css, widget 样式

## 阶段七：示例站点 & 迁移
- example-stellar/ 示例项目
- 迁移脚本 + 文档

## 关键决策
- Widget: defineWidget() + TS Declaration Merging (类型安全、可扩展)
- Tag Plugins: 保留 {% %} 语法 remark 解析 (降低迁移成本)
- Wiki/Notebook: 独立插件包 + 自定义 Collection (按需启用)
- 侧边栏: 主题层实现 (非框架层)
- 评论: Island + Slot 插件 (懒加载、解耦)
- 样式: Stylus → CSS + --t-* tokens

## 范围
包含: 核心布局、Widget 系统、Wiki+Notebook、P0/P1 Tags、Giscus+搜索、暗色+响应式
排除: Topic 系统、P2/P3 Tags、GitHub widgets、View Transitions、I18n、自动迁移工具
