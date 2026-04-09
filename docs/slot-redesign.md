# 把 Widget 和 Slot 统一成一个模型

整体脉络分四层，从内到外逐步展开：

------

## 第一层：类型定义重构（`@titan/types`）

核心是把 `widget.ts` 和 `theme.ts` 里的 `SlotComponentDefinition` 合并进新的 `block.ts`：

```ts
// packages/types/src/block.ts  ← 新文件

export interface BlockDefinition<TConfig = unknown, TData = unknown> {
  name: string

  // 原 Widget 的 configSchema
  configSchema: z.ZodType<TConfig>

  // 原 SlotComponent 的 slot 字段，升级为数组
  // 声明这个 Block 能出现在哪些 slot 锚点
  // 不填 = 只能出现在 siteTree 侧边栏
  slots?: string[]

  // 原 dataLoader，升级为 async
  // 在 Generate 阶段执行，结果注入 render 的 ctx.data
  prefetch?: (ctx: BlockPrefetchContext<TConfig>) => Promise<TData>

  // 统一的渲染函数（原 Widget 的 component）
  render: (ctx: BlockRenderContext<TConfig, TData>) => any

  // 条件渲染守卫（原来没有）
  guard?: (ctx: BlockGuardContext<TConfig>) => boolean

  // 原 SlotComponent 的 island 和 order
  island?: IslandDefinition
  order?: number
}

export interface BlockPrefetchContext<TConfig> {
  config: TConfig
  siteData: SiteData
  route: Route
  entry?: BaseEntry
}

export interface BlockRenderContext<TConfig, TData> {
  config: TConfig
  data: TData          // prefetch 的结果
  route: Route
  entry?: BaseEntry
  site: SiteContext
}

export interface BlockGuardContext<TConfig> {
  config: TConfig
  entry?: BaseEntry
  route: Route
}
```

同时 `SlotComponentDefinition` 和 `WidgetDefinition` 标记 `@deprecated`，保留一个版本的向后兼容。

------

## 第二层：BlockRegistry 替换 WidgetRegistry（`@titan/core`）

`widget-registry.ts` 改为 `block-registry.ts`，核心新增 `prefetchAll()` 方法：

```ts
export class BlockRegistry {
  private definitions = new Map<string, BlockDefinition<any, any>>()
  
  // 原 WidgetRegistry 的注册逻辑不变
  register(def: BlockDefinition<any, any>) { ... }

  // 新增：按 slot 名查询能注入的所有 Block
  // 替换原来 theme-loader 里的 collectSlotComponents
  getBlocksForSlot(slotName: string): BlockDefinition<any, any>[] {
    return [...this.definitions.values()]
      .filter(b => b.slots?.includes(slotName))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }

  // 新增：在 Generate 阶段批量执行 prefetch
  // 返回 Map<blockName-routeUrl, prefetchedData>
  async prefetchAll(
    routes: Route[],
    siteData: SiteData,
  ): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>()
    
    for (const def of this.definitions.values()) {
      if (!def.prefetch) continue
      
      await Promise.all(routes.map(async route => {
        const config = this.resolveConfig(def.name)
        const data = await def.prefetch!({ config, siteData, route })
        results.set(`${def.name}::${route.url}`, data)
      }))
    }
    
    return results
  }
}
```

------

## 第三层：Engine 的 Generate 阶段植入 prefetch

这是接入现有管线最关键的改动，只需在 `engine.ts` 的 `generate()` 方法里加一步：

```ts
// engine.ts - generate() 方法
async generate(entries, singletonData): Promise<GenerateResult> {
  // ... 现有逻辑不变 ...
  const routes = generateRoutes(siteData)

  // ← 新增这一步，在 generate 阶段完成后、emit 之前
  const blockData = await this.blockRegistry.prefetchAll(routes, siteData)

  // 把 blockData 挂到 generateCtx 上传递给 emit
  const generateCtx: GenerateContext = { siteData, routes, blockData }
  
  return { siteData, routes, generateCtx }
}
```

`GenerateContext` 类型里加 `blockData: Map<string, unknown>`，`EmitContext` 的 renderer 渲染时按 `blockName::routeUrl` 取数据。

------

## 第四层：Renderer 里的 `<Slot>` 和 `<Block>` 统一

`renderer.ts` 里的 `<Slot>` 组件改成查 `BlockRegistry` 而不是原来的 `slotComponents` map：

```tsx
// renderer.ts
export function Slot({ name, props }) {
  const { blockRegistry, blockData, route } = useContext(RenderContext)
  
  const blocks = blockRegistry.getBlocksForSlot(name)
  
  const rendered = blocks
    .filter(b => !b.guard || b.guard({ config: resolveConfig(b), entry: props?.entry, route }))
    .map(b => {
      const data = blockData.get(`${b.name}::${route.url}`)
      // render 函数直接调用，不再通过 h(component, props)
      return b.render({ config: resolveConfig(b), data, route, entry: props?.entry, site: props?.site })
    })

  // 去掉现在强制的 <div data-slot>，改为 Fragment
  return rendered.length > 0 ? h(Fragment, null, ...rendered) : null
}
```

------

## 各方的 API 变化

**插件作者**（变化最大，但更简洁）：

```ts
// 之前：Widget 和 SlotComponent 分开写
definePlugin({
  widgets: [defineWidget({ name: 'comments', ... })],
  slotComponents: [{ slot: 'post:after-content', component: Comments }],
})

// 之后：一个 defineBlock 搞定
definePlugin({
  blocks: [defineBlock({
    name: 'comments',
    configSchema: z.object({ provider: z.string() }),
    slots: ['post:after-content'],        // 能出现在哪些锚点
    async prefetch({ entry, config }) {
      return fetchCommentCount(entry?.url)
    },
    guard: ({ entry }) => !entry?.frontmatter.draft,
    render: ({ data, config }) => <Comments count={data} provider={config.provider} />,
    island: { activate: 'client:visible' },
  })]
})
```

**主题作者**（几乎不变）：

```tsx
// 布局里的 Slot 用法完全不变
export default function PostLayout({ post, site }) {
  return (
    <article>
      <div innerHTML={post.html} />
      <Slot name="post:after-content" props={{ post, site }} />
    </article>
  )
}
```

**用户配置**（统一到 siteTree）：

```js
// titan.config.js
export default {
  siteTree: {
    post: {
      rightbar: ['toc', 'recent-posts'],       // Block 出现在侧边栏
      after: ['comments', 'related-posts'],     // Block 出现在 slot 锚点
    }
  }
}
```

------

## 改动范围汇总

| 文件                                  | 改动性质                                                  |
| ------------------------------------- | --------------------------------------------------------- |
| `packages/types/src/block.ts`         | 新增，核心类型                                            |
| `packages/types/src/widget.ts`        | 标记 deprecated，保留兼容                                 |
| `packages/types/src/theme.ts`         | `SlotComponentDefinition` deprecated                      |
| `packages/types/src/config.ts`        | `PluginDefinition.blocks` 替换 `slotComponents`+`widgets` |
| `packages/core/src/block-registry.ts` | 新增，替换 `widget-registry.ts`                           |
| `packages/core/src/engine.ts`         | `generate()` 里加 `prefetchAll()`，传递 `blockData`       |
| `packages/core/src/renderer.ts`       | `<Slot>` 查 `BlockRegistry`，去掉强制 `<div>`             |
| `packages/core/src/theme-loader.ts`   | 删 `collectSlotComponents`，Block 注册到 `BlockRegistry`  |
| `packages/core/src/plugin-manager.ts` | `registerContent()` 处理 `blocks` 字段                    |

最小可行路径是按 types → BlockRegistry → Engine.generate → Renderer 这个顺序，每步都可以独立测试，不需要一次性全部完成。