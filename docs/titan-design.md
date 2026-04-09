# Titan 设计方案

> 面向现代前端生态的新一代静态站点生成框架

**版本：** v0.1-draft  
**状态：** 设计阶段

---

## 目录

1. [项目定位](#一项目定位)
2. [核心设计原则](#二核心设计原则)
3. [整体架构](#三整体架构)
4. [技术选型决策](#四技术选型决策)
5. [第一阶段：核心引擎](#五第一阶段核心引擎第-1-4-周)
6. [第二阶段：插件系统与增量构建](#六第二阶段插件系统与增量构建第-5-9-周)
7. [第三阶段：主题系统](#七第三阶段主题系统第-10-15-周)
8. [第四阶段：样式体系](#八第四阶段样式体系第-16-18-周)
9. [第五阶段：生态完善](#九第五阶段生态完善第-19-24-周)
10. [风险与应对](#十风险与应对)

---

## 一、项目定位

Titan 是一个**以内容为核心**的静态站点生成框架，目标是：

- 对**新建项目**提供极致的开发体验，类似 Hexo 和 Vitepress
- 提供强类型的内容建模能力，而不只是"读取 Markdown 文件"
- 插件和主题之间通过明确契约交互，而不是共享全局对象
- 构建产物是纯静态 HTML，交互能力通过 Island 按需激活

目标用户是有一定前端背景、愿意用 TypeScript 配置自己站点的开发者。

---

## 二、核心设计原则

```
显式 > 隐式      Pipeline 替代神秘的事件总线
组合 > 继承      中间件栈替代 extend 注册表
契约 > 约定      TypeScript 接口替代文档约定
增量 > 全量      内容寻址缓存替代每次全量构建
代理 > 自研      资产处理交给 Vite，UI 运行时交给 Preact
```

---

## 三、整体架构

```
titan.config.ts
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│                       Core Engine                       │
│                                                         │
│   [Load] ──► [Transform] ──► [Generate] ──► [Emit]      │
│      洋葱中间件  文章级并发    路由聚合       Vite Build  │
└─────────────────────────────────────────────────────────┘
       │                                    │
       ▼                                    ▼
  Plugin System                       Theme System
  ├── IoC 容器 + DAG 调度            ├── Preact SSR
  ├── 内容类型注册表                  ├── 插槽（Slot）机制
  │   ├── Collection（集合）          ├── 插件组件注入
  │   └── Singleton（单例）           └── Island 激活
  └── 文件系统 JSON 缓存
       │                                    │
       └──────────────┬─────────────────────┘
                      ▼
              Vite Asset Pipeline
                      │
                      ▼
               public/ 静态产物
```

---

## 四、技术选型决策

以下每一项都是经过权衡的明确决策，非草案。

| 模块 | 选型 | 决策原因 |
|---|---|---|
| 语言 | TypeScript 全链路 | 无 JS 文件，类型即文档 |
| Monorepo | pnpm workspace | 轻量，链接速度快 |
| 框架构建 | tsup | 零配置，基于 esbuild |
| 资产构建 | **Vite**（代理，非自研） | Hash 指纹、压缩、HMR 全部复用，不重复造轮子 |
| Markdown | unified + remark | 可组合，插件生态完善 |
| JSX 运行时 | **Preact**（不自研） | SSR 成熟，体积小（~4KB gzip），Island hydration 免费复用 |
| Island 激活 | **Preact Signals + Vite chunk** | 不自研 hydration 机制，Astro 趟过的坑不重趟 |
| 数据缓存 | **文件系统 JSON**（不用 SQLite） | 零 native 依赖，CI 友好，类 Vite 的 .titan-cache 目录 |
| 配置 Schema | Zod | 类型推导 + 运行时校验二合一 |
| 样式隔离 | CSS Modules + `--t-*` Design Token | 主题与插件样式完全隔离 |
| 测试 | Vitest | 与 TS 生态一致 |

### 关键取舍说明

**为什么 JSX 运行时选 Preact 而不是自研？**

自研 `renderToString` 本身 500 行可以搞定，但 Island 架构的核心难点不在服务端渲染，而在客户端的按需水合（Hydration）：Props 如何序列化跨端传递？组件依赖如何提取打包成独立 Chunk？Context 如何跨端同步？每一项展开都是大工程，Astro 在这上面花了数年。Titan 的价值在内容管道和插槽机制，不在 UI 运行时，Preact 把这个问题解决了，直接用。

**为什么缓存不用 SQLite？**

个人博客和文档站点的内容量，内存完全够用。SQLite 的 native binding 在 Windows 和 CI 环境里是额外的摩擦，纯文件系统的 JSON 缓存（write-tmp + rename 原子操作）更简单可靠，类 Vite 的方案已被验证。

**为什么资产处理代理给 Vite？**

Markdown 里 `![img](./pic.png)` 必须经过构建管道才能得到带 Hash 的最终路径，才能被 CDN 有效缓存。自研这套依赖图追踪 + 压缩 + 路径替换是巨大的工程量。Titan 把资产引用告诉 Vite，Vite 处理后返回最终 URL，职责分离，各做各擅长的事。

**并发安全性如何保证？**

并发粒度是**文章级**，不是插件级。同一篇文章的 transform 中间件链依然串行执行（洋葱模型，天然有序），Post-1 和 Post-2 之间并发处理。跨文章的数据聚合（tags、categories 索引）放在 generate 阶段，所有文章处理完成后统一归集，没有共享可变状态，因此不存在竞态。

---

## 五、第一阶段：核心引擎（第 1-4 周）

### 5.1 目标

搭建最小可运行的骨架：读取 Markdown → Pipeline 处理 → 输出 HTML。

### 5.2 项目结构

```
titan/
├── packages/
│   ├── core/           # 核心引擎：Pipeline、数据模型、缓存
│   ├── cli/            # 命令行工具
│   ├── vite-plugin/    # Titan 的 Vite 插件（资产代理、HMR）
│   └── types/          # 共享类型定义（所有包共用）
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### 5.3 Pipeline 设计

四个阶段，每个阶段是独立的洋葱中间件栈。

```typescript
// packages/types/src/pipeline.ts

type Middleware<Ctx> = (ctx: Ctx, next: () => Promise<void>) => Promise<void>

interface Pipeline<Ctx> {
  use(middleware: Middleware<Ctx>): this
  run(ctx: Ctx): Promise<void>
}

// 四个阶段的 Context 类型
interface LoadContext {
  filePath: string
  rawContent: string
  frontmatter: Record<string, unknown>
  contentType: string       // 'post' | 'note' | 自定义类型名
}

interface TransformContext {
  entry: BaseEntry          // 具体类型由 contentType 决定
  html: string              // Markdown 渲染结果（中间产物）
  assets: AssetRef[]        // 收集到的资产引用，传给 Vite
}

interface GenerateContext {
  siteData: SiteData        // 所有 collection + singleton 的聚合
  routes: Route[]           // 待生成的路由列表
}

interface EmitContext {
  route: Route
  siteData: SiteData
  outputPath: string
}
```

**并发模型：**

```
[Transform 阶段]

  文章 1 → [中间件 A → 中间件 B → 中间件 C]  ──┐
  文章 2 → [中间件 A → 中间件 B → 中间件 C]  ──┤ Promise.all
  文章 3 → [中间件 A → 中间件 B → 中间件 C]  ──┘
                                                │
                                                ▼
                                    [Generate 阶段]
                                    聚合 tags / categories
                                    计算 prev / next
                                    （串行，此时所有文章已处理完成）
```

每篇文章在自己的 Pipeline 实例内串行执行，文章之间并发。
没有共享可变状态，天然无竞态。

### 5.4 核心数据模型

```typescript
// packages/types/src/content.ts

// 所有内容类型的公共基础
interface BaseEntry {
  id: string
  slug: string
  contentType: string         // 'post' | 'note' | ...
  locale: string              // 预留 I18n，默认为站点 language
  alternates: AlternateLink[] // 同一内容的其他语言版本（预留）
  frontmatter: Record<string, unknown>
  content: string             // 原始 Markdown
  html: string                // 渲染后 HTML
  path: string                // 输出文件路径
  url: string                 // 最终访问 URL
  assets: ResolvedAsset[]     // Vite 处理后的资产列表
}

// 内置 Post 类型（extends BaseEntry）
interface Post extends BaseEntry {
  contentType: 'post'
  title: string
  date: Date
  updated: Date
  tags: Tag[]
  categories: Category[]
  excerpt: string
  headings: Heading[]
  readingTime: number
  prev: Post | null
  next: Post | null
}

// 内置 Page 类型
interface Page extends BaseEntry {
  contentType: 'page'
  title: string
}

// 资产引用：Markdown 里的图片、附件等
interface AssetRef {
  originalPath: string        // Markdown 中的原始路径（相对）
  absolutePath: string        // 文件系统绝对路径
}

interface ResolvedAsset extends AssetRef {
  finalUrl: string            // Vite 处理后的带 Hash URL
}

// 目录项
interface Heading {
  depth: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  slug: string
  children: Heading[]
}

// I18n 备用链接
interface AlternateLink {
  locale: string
  url: string
}

// SiteData：全站数据聚合，动态扩展
// 内置部分
interface SiteData {
  posts: Collection<Post>
  pages: Collection<Page>
  tags: Map<string, Tag>
  categories: Map<string, Category>
  // 插件通过 Declaration Merging 追加字段（见第二阶段）
}
```

### 5.5 配置系统

```typescript
// titan.config.ts（用户编写）
import { defineConfig } from 'titan'
import remarkGfm from 'remark-gfm'

export default defineConfig({
  title: 'My Site',
  url: 'https://example.com',
  language: 'zh-CN',

  build: {
    outDir: 'public',
    cacheDir: '.titan-cache',
    concurrency: 8,           // 文章并发处理数
  },

  markdown: {
    remarkPlugins: [remarkGfm()],
    rehypePlugins: [],
    highlight: {
      theme: 'github-dark',   // Shiki 主题
    },
  },

  // 样式 token 覆盖（第四阶段详细展开）
  styles: {
    tokens: {},
    global: undefined,
  },

  plugins: [],
  theme: undefined,
})
```

### 5.6 文件系统缓存

```
.titan-cache/
├── manifest.json             # { filePath → contentHash } 映射表
└── entries/
    ├── a3f2c1[hash].json     # 单篇文章的处理结果（序列化的 Post）
    ├── b9e1d4[hash].json
    └── ...
```

```typescript
// 缓存写入：原子操作，避免部分写入导致的缓存损坏
async function writeCache(hash: string, data: ProcessedEntry) {
  const tmpPath = `${CACHE_DIR}/entries/${hash}.tmp`
  const finalPath = `${CACHE_DIR}/entries/${hash}.json`
  await fs.writeFile(tmpPath, JSON.stringify(data))
  await fs.rename(tmpPath, finalPath)   // 原子替换
}

// 缓存命中判断
async function isCacheValid(filePath: string): Promise<boolean> {
  const currentHash = await hashFile(filePath)
  const manifest = await readManifest()
  return manifest[filePath] === currentHash
}
```

### 5.7 CLI 基础命令

```bash
titan dev              # 启动开发服务器
titan build            # 生产构建
titan build --no-cache # 跳过缓存，全量重建
titan clean            # 清除缓存和产物
titan info             # 打印环境、插件、主题信息
```

### 5.8 里程碑

- [ ] pnpm monorepo 初始化
- [ ] 四阶段 Pipeline 骨架跑通
- [ ] 读取 `_posts/*.md`，渲染为 HTML
- [ ] 文件系统缓存（hash 判断 + 原子写入）
- [ ] 基础 Vite 集成（dev server + build）
- [ ] `titan dev` 和 `titan build` 可用

---

## 六、第二阶段：插件系统与增量构建（第 5-9 周）

### 6.1 目标

完整的插件 API，包括内容类型注册（Collection / Singleton）、IoC 容器、DAG 并发调度、增量构建依赖追踪。

### 6.2 内容类型注册：Collection

Collection 是有多个条目的内容类型，每条来自一个 Markdown 文件。

```typescript
// packages/types/src/collection.ts

interface CollectionDefinition<T extends BaseEntry = BaseEntry> {
  name: string
  // 来源：glob 路径（本地文件）
  source: string | string[]
  // frontmatter 校验 schema（Zod）
  schema: ZodSchema<Omit<T, keyof BaseEntry>>
  // 路由策略
  routes: {
    item: string              // '/notes/:slug'
    list?: string             // '/notes'
    paginate?: {
      size: number
      path: string            // '/notes/page/:n'
    }
  }
  // 对应的主题 layout 名称
  layout: string
  // I18n locale 提取策略（可选）
  locale?: {
    strategy: 'filename-suffix'   // post.en.md → locale: 'en'
            | 'directory'         // en/_posts/post.md → locale: 'en'
    default: string
    fallback: boolean
  }
}

// 定义函数（插件中调用）
function defineCollection<T extends BaseEntry>(
  def: CollectionDefinition<T>
): CollectionDefinition<T>
```

**示例：笔记插件**

```typescript
// @titan/plugin-notes/index.ts
import { definePlugin, defineCollection } from 'titan'
import { z } from 'titan/zod'

export default definePlugin({
  name: '@titan/plugin-notes',

  collections: [
    defineCollection({
      name: 'notes',
      source: 'source/_notes/**/*.md',
      schema: z.object({
        title: z.string(),
        date: z.coerce.date(),
        tags: z.array(z.string()).default([]),
        source_url: z.string().url().optional(),
      }),
      routes: {
        item: '/notes/:slug',
        list: '/notes',
        paginate: { size: 20, path: '/notes/page/:n' },
      },
      layout: 'note',
    }),
  ],
})
```

**注册后自动扩展 SiteData 类型（Declaration Merging）：**

```typescript
// @titan/plugin-notes 内部自动生成
declare module 'titan' {
  interface SiteData {
    notes: Collection<Note>   // Note = BaseEntry + notes 的 schema 字段
  }
}

// 主题 / 其他插件中即可使用，有完整类型推导
const recentNotes = await site.data.notes
  .sort('date', 'desc')
  .limit(5)
  .find()
```

**Collection 查询 API：**

```typescript
interface Collection<T> {
  find(filter?: FilterQuery<T>): Promise<T[]>
  findOne(slug: string): Promise<T | null>
  sort(key: keyof T, order?: 'asc' | 'desc'): this
  limit(n: number): this
  paginate(size: number): Paginator<T>
  count(): Promise<number>
  // I18n
  locale(code: string): this        // 过滤指定语言
  withAlternates(): this            // 同时加载其他语言版本信息
}
```

### 6.3 内容类型注册：Singleton

Singleton 是全局唯一的数据，支持三种来源。

```typescript
interface SingletonDefinition<T> {
  name: string
  source:
    | string                    // 文件路径（.md / .json / .ts）
    | (() => Promise<T>)        // 异步函数（远程 API、动态计算）
  schema: ZodSchema<T>
  // 异步 source 的缓存策略
  cache?: 'build'               // 每次构建重新获取（默认）
        | 'persistent'          // 持久化到文件缓存，按 TTL 刷新
  cacheTTL?: number             // 毫秒，仅 'persistent' 时有效
  // 获取失败时的兜底（异步 source 专用）
  fallback?: T
}
```

**三种来源示例：**

```typescript
// 来源一：Markdown 文件（带 frontmatter）
defineSingleton({
  name: 'profile',
  source: 'source/_data/profile.md',
  schema: z.object({
    name: z.string(),
    bio: z.string(),
    avatar: z.string(),
    social: z.object({
      github: z.string().optional(),
    }),
  }),
})

// 来源二：JSON 文件
defineSingleton({
  name: 'friends',
  source: 'source/_data/friends.json',
  schema: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    avatar: z.string().optional(),
  })),
})

// 来源三：异步函数（构建时静态化）
defineSingleton({
  name: 'github_stats',
  source: async () => {
    const res = await fetch('https://api.github.com/users/myname')
    return res.json()
  },
  schema: z.object({
    public_repos: z.number(),
    followers: z.number(),
  }),
  cache: 'persistent',
  cacheTTL: 3_600_000,          // 1小时
  fallback: { public_repos: 0, followers: 0 },
})
```

### 6.4 插件 API 完整定义

```typescript
interface PluginDefinition {
  name: string

  // 内容类型注册
  collections?: CollectionDefinition[]
  singletons?: SingletonDefinition[]

  // IoC 声明
  inject?: (keyof SiteData)[]   // 声明依赖的数据（容器注入）
  produces?: string[]            // 声明写入的数据字段（依赖分析用）

  // Pipeline 钩子
  hooks?: {
    // Load 阶段
    'load:before'?:         Middleware<LoadContext>
    'load:after'?:          Middleware<LoadContext>

    // Transform 阶段（文章级并发内的串行中间件）
    'transform:entry'?:     Middleware<TransformContext>  // 所有内容类型
    'transform:post'?:      Middleware<TransformContext>  // 仅 Post
    'transform:page'?:      Middleware<TransformContext>  // 仅 Page
    // 自定义内容类型的钩子通过 defineCollection 的 transform 字段注册

    // Generate 阶段
    'generate:before'?:     Middleware<GenerateContext>
    'generate:routes'?:     Middleware<GenerateContext>
    'generate:after'?:      Middleware<GenerateContext>

    // Emit 阶段
    'emit:before'?:         Middleware<EmitContext>
    'emit:after'?:          Middleware<EmitContext>
  }

  // 主题插槽组件（第三阶段展开）
  slotComponents?: SlotComponentDefinition[]
}

// 插件定义函数
function definePlugin(def: PluginDefinition): PluginDefinition
```

**插件类型一览：**

| 类型 | 主要能力 | 典型示例 |
|---|---|---|
| ContentPlugin | 注册 collection / singleton | plugin-notes, plugin-profile |
| TransformPlugin | transform 钩子，处理 HTML/AST | plugin-math, plugin-prism |
| GeneratorPlugin | generate 钩子，生成额外路由 | plugin-sitemap, plugin-rss |
| EmitPlugin | emit 钩子，构建后处理 | plugin-image, plugin-cdn |
| ThemePlugin | slotComponents，注入主题插槽 | plugin-comments, plugin-analytics |

### 6.5 IoC 容器与 DAG 调度

**依赖图分析（启动时）：**

```
插件 A：produces ['post.readingTime']
插件 B：produces ['post.toc'], inject ['post.content']
插件 C：inject ['post.readingTime', 'post.toc']

依赖图：A ──► C
        B ──► C

并发执行：A、B 并发 → C
```

**冲突检测（启动时，不在运行时）：**

```bash
$ titan build

✗ 插件冲突：启动终止
  plugin-related 和 plugin-related-v2 同时声明写入 post.related
  请移除其中一个插件。
```

### 6.6 增量构建与依赖追踪

```typescript
// 依赖追踪：记录每篇文章依赖哪些外部数据
interface EntryDependencies {
  fileHash: string                   // 文件内容 hash
  tagSlugs: string[]                 // 引用的 tag
  categorySlugs: string[]            // 引用的 category
  singletonNames: string[]           // 引用的 singleton
  layoutName: string                 // 使用的 layout
}

// 增量判断逻辑
async function needsRebuild(entry: BaseEntry): Promise<boolean> {
  const deps = await loadDependencies(entry.id)

  // 1. 自身文件变了
  if (await fileHashChanged(entry)) return true

  // 2. 依赖的 tag/category 统计变了（影响 prev/next、列表）
  if (await tagStatsChanged(deps.tagSlugs)) return true

  // 3. 依赖的 singleton 数据变了
  if (await singletonChanged(deps.singletonNames)) return true

  // 4. 使用的 layout 模板变了
  if (await layoutHashChanged(deps.layoutName)) return true

  return false
}
```

**Watch 模式变更路由：**

```
文件变化（chokidar）
    │
    ▼
变更类型分析
    ├── source/_posts/*.md     → 仅重建该文章 + prev/next 邻居
    ├── source/_notes/*.md     → 仅重建该笔记
    ├── source/_data/*.json    → Singleton 失效 → 重建所有依赖该 singleton 的页面
    ├── titan.config.ts        → 全量重建
    ├── 主题 layout/*.tsx      → layout hash 变化 → 重建引用该 layout 的所有页面
    ├── 主题 components/*.tsx  → 分析组件引用树，最小化重建
    └── 样式文件               → Vite HMR 处理，不触发内容重建
    │
    ▼
WebSocket 通知浏览器（Vite HMR 协议）
```

### 6.7 里程碑

- [ ] `defineCollection` + `defineSingleton` 实现
- [ ] Declaration Merging 自动类型扩展
- [ ] Singleton 三种来源（MD / JSON / async）支持
- [ ] async source 的 `persistent` 缓存 + fallback
- [ ] IoC 容器 + DAG 构建 + 并发执行
- [ ] 启动时静态冲突检测
- [ ] 增量构建依赖追踪（文章级 + singleton 级）
- [ ] Watch 模式最小化重建

---

## 七、第三阶段：主题系统（第 10-15 周）

### 7.1 目标

完整的 JSX 主题系统，基于 Preact SSR，支持插槽（Slot）机制、Island 架构、类型安全的配置。

### 7.2 主题目录结构

```
my-theme/
├── theme.config.ts          # 主题元信息、配置 Schema、插槽声明
├── layouts/                 # 布局文件（一个文件对应一个内容类型）
│   ├── default.tsx          # 兜底布局
│   ├── post.tsx
│   ├── page.tsx
│   ├── note.tsx             # 对应 plugin-notes 注册的内容类型
│   ├── tag.tsx
│   ├── category.tsx
│   └── archive.tsx
├── components/              # 主题内部组件（CSS Modules）
│   ├── Header.tsx
│   ├── Header.module.css
│   ├── Footer.tsx
│   ├── Footer.module.css
│   ├── PostCard.tsx
│   ├── PostCard.module.css
│   ├── TOC.tsx
│   ├── TOC.module.css
│   └── Pagination.tsx
├── islands/                 # 需要客户端激活的组件
│   ├── Search.tsx
│   └── ThemeToggle.tsx
├── styles/
│   ├── tokens.css           # Design Token 赋值（--t-* 变量）
│   ├── global.css           # 全局排版、prose 样式
│   └── variables.css        # 主题私有变量（不对外暴露）
└── public/                  # 主题静态资源
    └── fonts/
```

### 7.3 Preact SSR 集成

主题文件是标准的 Preact/JSX 组件，`renderToString` 直接用 `preact-render-to-string`：

```tsx
// packages/core/src/renderer.ts
import { renderToString } from 'preact-render-to-string'
import { h } from 'preact'

export async function renderLayout(
  layoutModule: LayoutModule,
  ctx: PageContext
): Promise<string> {
  const vnode = h(layoutModule.default, ctx)
  const body = renderToString(vnode)

  // 注入 Island hydration 脚本（Vite 生成）
  return injectIslands(body, ctx.islands)
}
```

**tsconfig（主题目录）：**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

### 7.4 布局解析

```typescript
// 布局解析：优先级从高到低
function resolveLayout(entry: BaseEntry, theme: Theme): string {
  return (
    String(entry.frontmatter.layout ?? '') ||   // 1. frontmatter 显式指定
    theme.typeLayoutMap[entry.contentType] ||    // 2. contentType 映射
    'default'                                    // 3. 兜底
  )
}

// 主题内置映射 + 插件注册的类型自动追加
const typeLayoutMap: Record<string, string> = {
  post:      'post',
  page:      'page',
  tag:       'tag',
  category:  'category',
  archive:   'archive',
  note:      'note',        // plugin-notes 注册时自动追加
}
```

### 7.5 强类型 Context 注入

```typescript
// packages/types/src/theme.ts

// 所有 layout 共用的基础 Context
interface PageContext {
  site: SiteContext
  theme: ThemeConfig          // Zod 校验后的主题配置
  pagination?: Pagination
}

// 各内容类型的 Context（继承 PageContext）
interface PostContext extends PageContext {
  post: Post
}

interface NoteContext extends PageContext {
  note: Note                  // 来自 plugin-notes 的类型
}

// SiteContext：不直接暴露原始数据，通过 query API 按需获取
interface SiteContext {
  title: string
  url: string
  language: string
  config: SiteConfig
  data: SiteData              // 包含所有 collection + singleton（类型安全）
}
```

### 7.6 插槽（Slot）机制

插槽是主题暴露给插件的**扩展点**，插件可以向插槽注入独立组件（含样式、Island）。

#### 主题声明插槽

```typescript
// theme.config.ts
import { defineTheme, defineSlot, z } from 'titan'

export default defineTheme({
  name: 'my-theme',
  version: '1.0.0',

  slots: {
    'post:after-content': defineSlot({
      description: '文章正文之后（评论、版权声明等）',
      props: z.object({
        post: PostSchema,
        site: SiteContextSchema,
      }),
      mode: 'stack',    // 多个组件垂直堆叠
    }),

    'post:sidebar': defineSlot({
      description: '文章侧边栏（TOC、相关文章等）',
      props: z.object({ post: PostSchema }),
      mode: 'stack',
    }),

    'head:extra': defineSlot({
      description: '<head> 内额外内容（统计脚本、字体等）',
      props: z.object({ page: BaseEntrySchema }),
      mode: 'stack',
    }),

    'footer:extra': defineSlot({
      description: 'Footer 之后的全局追加',
      props: z.object({ site: SiteContextSchema }),
      mode: 'stack',
    }),
  },

  config: z.object({
    primaryColor:    z.string().default('#2563eb'),
    showReadingTime: z.boolean().default(true),
    showTOC:         z.boolean().default(true),
    navLinks: z.array(z.object({
      text: z.string(),
      href: z.string(),
    })).default([]),
    darkMode: z.enum(['class', 'media', 'both']).default('both'),
  }),
})
```

#### 主题 Layout 使用插槽

```tsx
// layouts/post.tsx
import { Slot } from 'titan/runtime'
import Header from '../components/Header'
import TOC from '../components/TOC'
import Pagination from '../components/Pagination'

export default function PostLayout({ post, site, theme, pagination }: PostContext) {
  return (
    <html lang={site.language}>
      <head>
        <meta charset="utf-8" />
        <title>{post.title} | {site.title}</title>
        <meta name="description" content={post.excerpt} />
        {/* 插件在此注入统计脚本、字体声明等 */}
        <Slot name="head:extra" props={{ page: post }} />
      </head>
      <body>
        <Header site={site} theme={theme} />

        <div class="layout">
          <main>
            <article>
              <h1>{post.title}</h1>
              <div
                class="titan-prose"
                dangerouslySetInnerHTML={{ __html: post.html }}
              />
            </article>

            {pagination && <Pagination {...pagination} />}

            {/* 插件在此注入评论、版权声明等 */}
            <Slot name="post:after-content" props={{ post, site }} />
          </main>

          <aside>
            {theme.showTOC && <TOC headings={post.headings} />}
            {/* 插件在此注入额外 sidebar widget */}
            <Slot name="post:sidebar" props={{ post }} />
          </aside>
        </div>

        <Slot name="footer:extra" props={{ site }} />
      </body>
    </html>
  )
}
```

#### 插件注册插槽组件

```typescript
// @titan/plugin-comments/index.ts
import { definePlugin, defineSlotComponent } from 'titan'

export default definePlugin({
  name: '@titan/plugin-comments',

  slotComponents: [
    defineSlotComponent({
      slot: 'post:after-content',

      // Preact 组件，完全自包含
      component: ({ post, site }: PostSlotProps) => (
        <div class={styles.container}>
          <h2 class={styles.heading}>评论</h2>
          <div
            id="giscus-container"
            data-repo={site.config.comments?.repo ?? ''}
            data-post={post.slug}
          />
        </div>
      ),

      // 组件私有样式（构建时 scope 隔离，见第四阶段）
      styles: () => import('./Comments.module.css'),

      // 组件的客户端激活（Island）
      island: {
        component: () => import('./CommentsClient'),
        activate: 'client:visible',
      },

      // 同一插槽多组件时的排序权重
      order: 10,
    }),
  ],
})

// @titan/plugin-analytics/index.ts
export default definePlugin({
  name: '@titan/plugin-analytics',
  slotComponents: [
    defineSlotComponent({
      slot: 'head:extra',
      component: ({ page }: { page: BaseEntry }) => (
        <script
          defer
          data-domain={page.url}
          src="https://plausible.io/js/script.js"
        />
      ),
      order: 1,
    }),
  ],
})
```

#### 插槽渲染流程

```
构建时（startup）
  1. 收集所有插件的 slotComponents
  2. 按 slot 名称分组，按 order 排序
  3. 检查每个组件的目标 slot 是否在当前主题中声明
     → 若不存在：构建终止，给出明确错误

渲染时（per page）
  <Slot name="post:after-content" props={...} />
    → 按 order 依次 renderToString 各组件
    → 拼接 HTML 片段
    → 收集各组件的 Island 声明

Vite 构建时
  → 为各 Island 组件生成独立的 JS chunk
  → 注入激活策略脚本
```

**插槽不匹配的错误提示：**

```bash
✗ 插槽声明错误：构建终止
  插件：@titan/plugin-comments
  目标插槽："post:after-content"

  当前主题 "my-theme@1.0.0" 未声明此插槽。
  已声明插槽：post:sidebar, head:extra, footer:extra

  建议：联系主题作者添加此插槽，或更换支持此插槽的主题。
```

### 7.7 Island 架构

基于 Preact，Vite 处理 chunk 分割，Titan 处理激活策略注入。

```tsx
// 主题 islands/Search.tsx（Preact 组件）
import { useState } from 'preact/hooks'

export default function Search() {
  const [query, setQuery] = useState('')
  // ...
}

// 在 layout 中使用，加 client:* 指令
// Titan 的 JSX 转换器识别这些指令，生成对应的激活代码
<Search client:visible />
<ThemeToggle client:idle />
<Comments client:load />
```

**激活策略：**

| 指令 | 触发时机 | 适用场景 |
|---|---|---|
| `client:load` | 页面加载立即 | 关键交互（评论等） |
| `client:visible` | 进入视口（IntersectionObserver） | 搜索、延迟内容 |
| `client:idle` | 浏览器空闲（requestIdleCallback） | 主题切换、非关键 UI |

**生成的 HTML（简化）：**

```html
<!-- Search Island：静态 HTML + 激活脚本 -->
<div data-titan-island="Search" data-activate="visible">
  <div class="search-placeholder">搜索...</div>
</div>
<script type="module">
  const observer = new IntersectionObserver(async ([entry]) => {
    if (entry.isIntersecting) {
      const { default: Search } = await import('/assets/islands/Search.[hash].js')
      hydrate(<Search />, entry.target)
      observer.disconnect()
    }
  })
  observer.observe(document.querySelector('[data-titan-island="Search"]'))
</script>
```

### 7.8 View Transitions（可选特性）

主题可选开启，Titan 注入轻量路由拦截器（~1KB）：

```typescript
// theme.config.ts
export default defineTheme({
  // ...
  viewTransitions: true,        // 主题作者决定是否开启
})
```

Titan 的路由拦截器逻辑：

```javascript
// 拦截同域链接点击
document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href]')
  if (!a || !isSameOrigin(a.href)) return

  e.preventDefault()
  const html = await fetch(a.href).then(r => r.text())
  const doc = new DOMParser().parseFromString(html, 'text/html')

  await document.startViewTransition(async () => {
    document.body.innerHTML = doc.body.innerHTML
    // 重新激活新页面中的 Islands
    await rehydrateIslands()
  })

  history.pushState(null, '', a.href)
})
```

注意：View Transitions 是**主题的可选能力**，不是框架强制特性。Island 状态在页面切换时会重新初始化（不保留），这是已知的设计取舍。

### 7.9 里程碑

- [ ] Preact SSR（preact-render-to-string）集成
- [ ] 布局解析 + Context 注入（支持插件注册的内容类型）
- [ ] 插槽声明（defineSlot）完整实现
- [ ] 插件 slotComponent 注册 + order 排序
- [ ] 插槽不匹配的启动时检测
- [ ] Island 激活指令（client:load / visible / idle）
- [ ] 主题配置 Schema（Zod）+ 类型推导
- [ ] 主题开发 HMR（Vite）
- [ ] View Transitions 可选支持

---

## 八、第四阶段：样式体系（第 16-18 周）

### 8.1 五层样式模型

```
┌──────────────────────────────────────────┐  优先级
│  5. 用户覆盖层  site 自定义 CSS / token  │  ↑ 最高
├──────────────────────────────────────────┤
│  4. 插件组件层  Slot Component CSS       │
├──────────────────────────────────────────┤
│  3. 主题组件层  Theme CSS Modules        │
├──────────────────────────────────────────┤
│  2. 主题全局层  tokens.css + global.css  │
├──────────────────────────────────────────┤
│  1. 框架基础层  Titan Reset              │  ↓ 最低
└──────────────────────────────────────────┘
```

### 8.2 第一层：框架基础（Titan Reset）

```css
/* packages/core/assets/titan-base.css */

*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; padding: 0; }
img, video, svg { display: block; max-width: 100%; }
input, button, textarea, select { font: inherit; }
```

框架预留两个 CSS 命名空间：

```
--titan-*    框架内部变量，主题和插件不得使用
--t-*        Design Token，主题赋值，插件只读
```

框架声明所有 `--t-*` token 的存在（不给默认值），主题必须提供赋值，否则构建时警告：

```css
/* 框架只预留命名空间，不赋值 */
:root {
  --t-color-bg:          ;
  --t-color-bg-subtle:   ;
  --t-color-surface:     ;
  --t-color-border:      ;
  --t-color-text:        ;
  --t-color-text-muted:  ;
  --t-color-accent:      ;
  --t-color-accent-hover:;
  --t-font-sans:         ;
  --t-font-mono:         ;
  --t-font-serif:        ;
  --t-text-xs: ; --t-text-sm: ; --t-text-base: ;
  --t-text-lg: ; --t-text-xl: ; --t-text-2xl:  ; --t-text-3xl: ;
  --t-leading-tight: ; --t-leading-normal: ; --t-leading-relaxed: ;
  --t-space-1: ; --t-space-2: ; --t-space-4: ;
  --t-space-6: ; --t-space-8: ; --t-space-12: ; --t-space-16: ;
  --t-radius-sm: ; --t-radius-md: ; --t-radius-lg: ; --t-radius-full: ;
  --t-shadow-sm: ; --t-shadow-md: ; --t-shadow-lg: ;
  --t-z-base: ; --t-z-dropdown: ; --t-z-modal: ; --t-z-toast: ;
}
```

### 8.3 第二层：主题全局层

**tokens.css：Design Token 赋值（主题的核心契约）**

```css
/* my-theme/styles/tokens.css */

:root {
  --t-color-bg:           #ffffff;
  --t-color-bg-subtle:    #f8f9fa;
  --t-color-surface:      #ffffff;
  --t-color-border:       #e5e7eb;
  --t-color-text:         #111827;
  --t-color-text-muted:   #6b7280;
  --t-color-accent:       #2563eb;
  --t-color-accent-hover: #1d4ed8;

  --t-font-sans:   'Inter', system-ui, sans-serif;
  --t-font-mono:   'JetBrains Mono', monospace;
  --t-font-serif:  'Lora', Georgia, serif;

  --t-text-xs:   0.75rem;   --t-text-sm:   0.875rem;
  --t-text-base: 1rem;      --t-text-lg:   1.125rem;
  --t-text-xl:   1.25rem;   --t-text-2xl:  1.5rem;
  --t-text-3xl:  1.875rem;

  --t-leading-tight:   1.25;
  --t-leading-normal:  1.5;
  --t-leading-relaxed: 1.75;

  --t-space-1:  0.25rem;  --t-space-2:  0.5rem;
  --t-space-4:  1rem;     --t-space-6:  1.5rem;
  --t-space-8:  2rem;     --t-space-12: 3rem;
  --t-space-16: 4rem;

  --t-radius-sm:   4px;   --t-radius-md:  8px;
  --t-radius-lg:   16px;  --t-radius-full: 9999px;

  --t-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --t-shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --t-shadow-lg: 0 10px 15px rgba(0,0,0,0.10);

  --t-z-base: 0; --t-z-dropdown: 100;
  --t-z-modal: 200; --t-z-toast: 300;
}

/* 暗色模式：只覆盖 Color Token */
[data-theme="dark"],
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --t-color-bg:           #0f172a;
    --t-color-bg-subtle:    #1e293b;
    --t-color-surface:      #1e293b;
    --t-color-border:       #334155;
    --t-color-text:         #f1f5f9;
    --t-color-text-muted:   #94a3b8;
    --t-color-accent:       #60a5fa;
    --t-color-accent-hover: #93c5fd;
  }
}
```

**global.css：全局排版与 Prose 样式**

```css
/* my-theme/styles/global.css */

body {
  font-family: var(--t-font-sans);
  font-size: var(--t-text-base);
  line-height: var(--t-leading-relaxed);
  color: var(--t-color-text);
  background-color: var(--t-color-bg);
}

/*
  .titan-prose：框架提供的标准文章排版 class
  主题在这里实现具体样式。主题在 layout 中用
  <div class="titan-prose" dangerouslySetInnerHTML=... />
  包裹文章内容即可获得标准排版。
*/
.titan-prose {
  max-width: 70ch;
  color: var(--t-color-text);

  h1, h2, h3, h4, h5, h6 {
    font-weight: 700;
    line-height: var(--t-leading-tight);
    margin-top: var(--t-space-8);
    margin-bottom: var(--t-space-4);
  }
  h2 { font-size: var(--t-text-2xl); }
  h3 { font-size: var(--t-text-xl); }

  p { margin-bottom: var(--t-space-4); }

  a {
    color: var(--t-color-accent);
    text-underline-offset: 3px;
    &:hover { color: var(--t-color-accent-hover); }
  }

  code:not(pre code) {
    font-family: var(--t-font-mono);
    font-size: 0.875em;
    background: var(--t-color-bg-subtle);
    border: 1px solid var(--t-color-border);
    border-radius: var(--t-radius-sm);
    padding: 0.15em 0.4em;
  }

  pre {
    font-family: var(--t-font-mono);
    background: var(--t-color-bg-subtle);
    border: 1px solid var(--t-color-border);
    border-radius: var(--t-radius-md);
    padding: var(--t-space-4);
    overflow-x: auto;
    margin-bottom: var(--t-space-6);
  }

  blockquote {
    border-left: 3px solid var(--t-color-accent);
    padding-left: var(--t-space-4);
    color: var(--t-color-text-muted);
    font-style: italic;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--t-text-sm);
    margin-bottom: var(--t-space-6);
  }
  th, td {
    border: 1px solid var(--t-color-border);
    padding: var(--t-space-2) var(--t-space-4);
  }
  th { background: var(--t-color-bg-subtle); font-weight: 600; }

  hr {
    border: none;
    border-top: 1px solid var(--t-color-border);
    margin: var(--t-space-8) 0;
  }
}
```

### 8.4 第三层：主题组件层（CSS Modules）

每个组件有独立的 `.module.css`，class 名构建时 scope 化：

```
编译规则：.[class] → .[theme-name]__[class]_[hash4]

示例：
  my-theme Header.module.css 的 .nav
  → .my-theme__nav_a3f2
```

```css
/* my-theme/components/Header.module.css */

/* 所有颜色、字体、间距只用 --t-* token，不硬编码 */
.header {
  height: var(--my-header-height);        /* 可用主题私有变量 */
  background: var(--t-color-surface);
  border-bottom: 1px solid var(--t-color-border);
  position: sticky;
  top: 0;
  z-index: var(--t-z-dropdown);
}

.nav {
  display: flex;
  gap: var(--t-space-6);
}

.navLink {
  color: var(--t-color-text-muted);
  text-decoration: none;
  font-size: var(--t-text-sm);
  transition: color 0.15s;
  &:hover { color: var(--t-color-accent); }
}
```

### 8.5 第四层：插件组件层

```css
/* @titan/plugin-comments/Comments.module.css */

/*
  编译规则：.[class] → .titan-comments__[class]_[hash4]
  约束规则：只允许使用 --t-* token，禁止硬编码颜色（构建时 lint）
*/

.container {
  margin-top: var(--t-space-8);
  padding-top: var(--t-space-8);
  border-top: 1px solid var(--t-color-border);
}

.heading {
  font-size: var(--t-text-xl);
  font-weight: 600;
  color: var(--t-color-text);
  margin-bottom: var(--t-space-4);
}
```

**插件样式 Lint（构建时自动检查）：**

```bash
✗ 插件样式违规：@titan/plugin-comments
  Comments.module.css（第 8 行）

  插件组件不允许使用硬编码颜色值。
  发现：color: #111827
  应改为：color: var(--t-color-text)

  插件组件只能引用 --t-* Design Token，
  以确保暗色模式自动适配。
```

**暗色模式自动适配原理：**

插件只用 `--t-*` token → 主题在 `[data-theme="dark"]` 下覆盖所有 `--t-color-*` → 插件颜色随之切换，**零额外工作**。

### 8.6 第五层：用户覆盖

```typescript
// titan.config.ts
export default defineConfig({
  styles: {
    // 优先级最高的 token 覆盖（改变主色调等）
    tokens: {
      '--t-color-accent': '#e11d48',
      '--t-font-sans': '"Noto Serif SC", serif',
    },
    // 追加全局 CSS（在主题 global.css 之后注入）
    global: './src/custom.css',
  },
})
```

### 8.7 样式产物结构

```
public/assets/
├── titan-base.[hash].css       # 框架 Reset（< 1KB）
├── theme.[hash].css            # 主题全局 + 所有组件
└── plugins/
    ├── comments.[hash].css     # 仅在用了 post:after-content 的页面加载
    ├── toc.[hash].css
    └── analytics.[hash].css
```

按页面按需加载：某页面没有用到某插槽，对应插件的 CSS 不会加载。

### 8.8 里程碑

- [ ] 两级 CSS 命名空间强制（`--titan-*` / `--t-*`）
- [ ] 主题 token 完整性校验（启动时警告）
- [ ] CSS Modules scope（主题组件 + 插件组件）
- [ ] 插件 CSS 硬编码颜色 lint
- [ ] `.titan-prose` class 文档与规范
- [ ] 按页面按插槽的 CSS 按需加载
- [ ] 暗色模式三种策略（class / media / both）
- [ ] 用户 token 覆盖 + 自定义 CSS 注入

---

## 九、第五阶段：生态完善（第 19-24 周）

### 9.1 内置插件

| 插件 | 类型 | 功能 | 优先级 |
|---|---|---|---|
| `@titan/plugin-sitemap` | Generator | 自动生成 sitemap.xml（含自定义内容类型） | P0 |
| `@titan/plugin-rss` | Generator | RSS 2.0 / Atom feed | P0 |
| `@titan/plugin-search` | Generator | 构建时生成搜索索引（pagefind） | P0 |
| `@titan/plugin-prism` | Transform | 代码高亮（Shiki） | P1 |
| `@titan/plugin-math` | Transform | KaTeX 数学公式 | P1 |
| `@titan/plugin-image` | Emit | 图片优化、WebP、懒加载 | P1 |
| `@titan/plugin-reading-time` | Content | 阅读时间估算 | P2 |
| `@titan/plugin-toc` | Content | 自动提取目录结构 | P2 |
| `@titan/plugin-og-image` | Emit | Open Graph 图片自动生成 | P2 |
| `@titan/plugin-comments` | Theme | Giscus 评论（插槽注入） | P2 |
| `@titan/plugin-analytics` | Theme | Plausible / GA 统计（插槽注入） | P2 |

### 9.2 远程数据源（defineCollection async 扩展）

```typescript
// 支持异步数据源的 Collection（远程 CMS）
defineCollection({
  name: 'cms_posts',
  source: async ({ cache }) => {
    // cache：上次拉取的结果 + 时间戳，插件自己决定是否重新拉取
    if (cache && Date.now() - cache.timestamp < 3_600_000) {
      return cache.data
    }
    return fetchNotionDatabase(process.env.NOTION_DB_ID)
  },
  // 远程数据的唯一标识（替代文件 hash）
  identity: (item) => item.id,
  schema: z.object({ /* ... */ }),
  routes: { item: '/cms/:slug' },
  layout: 'post',
})
```

### 9.3 CLI 完整命令

```bash
# 开发
titan dev                       # 启动开发服务器（HMR）
titan dev --port 4000 --host

# 构建
titan build                     # 生产构建
titan build --no-cache          # 跳过缓存，全量重建

# 诊断
titan info                      # 打印环境、插件、主题、已注册内容类型
titan info --slots               # 查看插槽注册情况（主题声明 vs 插件注入）
titan info --tokens              # 查看 token 赋值情况（含覆盖层级）
titan profile                   # 分析各阶段耗时分布

# 脚手架
titan create my-blog            # 创建新项目（交互式）
titan create --template blog my-site
titan create-theme my-theme     # 创建主题模板
titan create-plugin my-plugin   # 创建插件模板
```

### 9.4 错误体验设计

参考 Vite / Nuxt 的错误风格：

```bash
✗ 构建失败 · load:collection[notes]
  插件：@titan/plugin-notes
  文件：source/_notes/2024-01-01-typescript.md

  frontmatter 字段校验失败
  字段：source_url
  值：  "not-a-url"
  期望：有效的 URL 格式

  1 │ ---
  2 │ title: TypeScript 笔记
  3 │ source_url: "not-a-url"    ← 此处
  4 │ ---

  提示：修正为合法 URL，例如 "https://example.com/article"
```

### 9.5 I18n 架构扩展（路线图）

第一阶段已在数据模型预留 `locale` 和 `alternates` 字段，本阶段完整实现：

```typescript
defineCollection({
  name: 'posts',
  source: 'source/_posts/**/*.md',
  locale: {
    strategy: 'filename-suffix',  // post.en.md → en，post.zh.md → zh
    default: 'zh-CN',
    fallback: true,               // 无翻译时回退到默认语言
  },
  routes: {
    item: '/:locale/posts/:slug',
    // 默认语言不带 locale 前缀
    defaultLocaleItem: '/posts/:slug',
  },
})
```

---

## 十、风险与应对

| 风险 | 可能性 | 影响 | 应对策略 |
|---|---|---|---|
| Preact 与部分高级 JSX 语法不兼容 | 低 | 中 | 第三阶段早期建立组件兼容性测试集 |
| Vite 插件 API 在大版本升级时 breaking | 中 | 中 | 封装 `@titan/vite-plugin`，隔离 Vite API 依赖 |
| 文件系统缓存在极大量文章（10万+）时性能下降 | 低 | 低 | manifest 分片索引；极端场景再评估是否引入 SQLite |
| Island hydration 在 View Transitions 下状态丢失 | 高 | 低 | 已知取舍，文档明确说明；Islands 设计为无状态或自恢复 |
| 插件 async Singleton 构建时网络不稳定 | 中 | 中 | fallback 字段 + persistent 缓存兜底，构建不因网络失败 |
| 插件 CSS Token 约束被绕过（动态值等） | 低 | 中 | PostCSS lint 覆盖静态值，动态值通过 Code Review 规范 |
| 冷启动问题（无 Hexo 兼容） | 中 | 中 | 优先提供极致 DX 吸引新用户；Hexo 兼容层作为社区项目 |

---

## 附录一：完整数据流

```
source/
├── _posts/         ← 内置 Post Collection
├── _pages/         ← 内置 Page Collection
├── _notes/         ← plugin-notes 注册的 Collection
└── _data/
    ├── profile.md  ← plugin-profile 注册的 Singleton
    └── friends.json← plugin-profile 注册的 Singleton

         │
         ▼  [Load Pipeline]
  文件路由 → 对应 ContentType 的 loader
  Front Matter 解析 + Zod schema 校验
  资产引用收集（AssetRef[]）
  构建强类型 BaseEntry 对象

         │  （文章级并发 Promise.all）
         ▼  [Transform Pipeline]
  Markdown → HTML（unified + remark）
  插件 transform hook（串行，洋葱模型）
  资产引用传给 Vite → 得到带 Hash 的最终 URL
  readingTime / TOC / excerpt 等字段填充

         │  （串行）
         ▼  [Generate Pipeline]
  tags / categories 聚合（所有文章处理完后）
  prev / next 计算
  路由列表生成（item + list + paginate）
  Singleton 数据加载 + 校验
  额外路由生成（sitemap / rss / search-index）

         │  （路由级并发）
         ▼  [Emit Pipeline]
  resolveLayout(entry, theme)
  Context 组装（PageContext / PostContext / ...）
  Slot 组件收集 + 渲染
  Preact renderToString(layout, context)
  Island 激活脚本注入
  CSS 按需收集

         │
         ▼  [Vite Build]
  主题 CSS bundle
  插件 CSS chunks（按页面按插槽）
  Island JS chunks（按组件）
  资产 Hash + 压缩
  写出 public/
```



## 附录二：技术深水区与潜在挑战

将核心能力代理给 Vite 和 Preact 是极其聪明的做法，但这往往会将复杂度转移到“胶水层”的整合上。

### 1. Markdown 资产到 Vite 模块图的“桥接”难题

- **设计现状**：在 `Transform` 阶段收集 Markdown 中的 `AssetRef`，传给 Vite 处理，得到带 Hash 的最终 URL。
- **潜在挑战**：Vite 的核心是基于 ES Modules 的依赖图（Rollup 打包）。如果一个图片没有被 JS/CSS 直接 `import`，Vite 默认是不会处理它的。Titan 是在 Node.js 侧解析 Markdown，并非在浏览器端。
- **破局思路**：你可能需要编写一个深度的 `@titan/vite-plugin`，在构建时动态生成一个**虚拟模块（Virtual Module）**，将所有 Markdown 中解析到的图片路径显式地 `import` 到这个虚拟模块中，借此欺骗 Vite 将它们纳入资源图谱，再通过 Vite 的 `manifest.json` 或钩子拿回映射后的最终 URL。

### 2. Dev Server 下的 HMR（热更新）边界

- **设计现状**：样式文件 HMR，Markdown 变化触发最小化重建并通过 WebSocket 通知浏览器。
- **潜在挑战**：Vite 的 HMR 非常强大，但它针对的是组件（如 Preact Islands）和 CSS。当用户修改 Markdown 文本时，因为外层是纯静态 HTML 拼接的，标准做法通常是引发页面的 **Full Reload（全量刷新）**。
- **破局思路**：如果想做到修改 Markdown 也能像改组件一样无刷新更新，你需要向客户端注入一个 Titan 专用的 HMR Client，监听特定的 WebSocket 事件，拿到新的 HTML 片段后，手动执行 DOM Diff（类似 Turbo 的 morphdom 机制）替换 `<article>` 区域的内容，并在替换后触发该区域内 Island 的重新 Hydration。

### 3. Preact 的同步 vs 异步渲染

- **设计现状**：`renderToString(vnode)`
- **潜在挑战**：Preact 官方标准的 `preact-render-to-string` 是**同步**的。这意味着在渲染 Layout 和 Slot 组件时，组件内部不能有未解决的异步调用。
- **破局思路**：必须确保所有需要拉取的数据（哪怕是远程 CMS 数据）在 `Generate` 阶段就全部加载并塞入 `PageContext` 中，组件在渲染阶段只能做纯粹的同步数据消费。如果插件的 Slot 组件强依赖构建时的异步数据，需要在插件的 `generate` 钩子中提前获取并注入。

------

## 附录三：架构可扩展性建议

### 1. 主题组件的“逃生舱”（Theme Ejecting / Overrides）

- **现状**：主题通过 Slots 给插件留了扩展点。
- **问题**：如果用户用了 `my-theme`，觉得主题里的 `PostCard.tsx` 不好看，但他不想完全自己写一个新主题，怎么办？
- **建议**：设计一套**基于文件路径的组件覆盖约定制**。例如，如果用户在项目根目录创建了 `src/theme/components/PostCard.tsx`，Titan 的模块解析器会自动将主题中对 `PostCard` 的引用拦截，并指向用户自定义的文件。这在现代 SSG（如 VitePress、Docusaurus）中是极受欢迎的 DX 特性。

### 2. 编程编程式路由与复杂分页（Programmatic Routing）

- **现状**：Collection 的路由通过静态配置对象定义（`paginate: { size: 20, path: '/notes/page/:n' }`）。

- **问题**：这无法满足稍微复杂的分页需求。比如：“我想按年份聚合文章，生成 `/2023/page/1`”、“我想按作者生成分页”。

- **建议**：在 `routes` 配置中，除了提供简单的声明式对象，还应该支持一个编程式的回调函数：

  TypeScript

  ```
  routes: (items) => {
    // 允许开发者用代码自由组合路由和分页逻辑
    return buildCustomPagination(items);
  }
  ```

### 3. 插件执行顺序（Order/Priority）

- **现状**：通过 IoC 容器分析 `inject` 和 `produces` 构建 DAG 调度。
- **问题**：对于 `TransformPlugin`（如处理 AST 的统一插件组），它们可能都依赖 `post.content` 且产出 `post.html`，没有明确的数据依赖冲突，但执行顺序却至关重要（例如：必须先执行自定义短代码插件，再执行代码高亮插件）。
- **建议**：除了 DAG 数据依赖调度外，对于同阶段生命周期的中间件，依然需要暴露显式的 `enforce: 'pre' | 'post'` 或数值优先级（类似 Vite 插件配置），以处理逻辑先后顺序。