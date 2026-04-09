## TitanJS 框架优化建议

基于对整个代码库的深入分析（core、types、cli、vite-plugin、themes/stellar、以及 9 个插件），以下是按优先级分类的优化建议。

------

### 一、插件系统（Plugin System）

#### 1. 插件通过 `as any` 类型断言修改 Context——缺乏类型安全

**现状：** 几乎所有插件（toc、reading-time 等）都通过 `(ctx.entry as any).toc = tree` 或 `(ctx.entry as any).readingTime = minutes` 来扩展 entry 数据，完全绕过了 TypeScript 类型系统。

**建议：** 引入 **Plugin Data Map** 或 **Entry Extension 声明合并机制**。类似 Express 的 `declare module` 模式，让插件通过 declaration merging 声明它们添加的字段，然后在 `TransformContext` 上提供类型安全的 `setData(key, value)` / `getData(key)` 方法，或者在 `BaseEntry` 上增加一个 typed `extensions: Map<string, unknown>`。这样既保留了灵活性，又能在 TypeScript 层面做到类型安全。

**涉及文件：** `packages/types/src/content.ts`, `packages/types/src/pipeline.ts`, 所有插件的 `src/index.ts`

#### 2. DAG 执行计划（IoC）的结果未被实际使用

**现状：** `engine.ts:135` 调用了 `buildExecutionPlan(this.config.plugins)` 但返回值被忽略了。`registerPluginHooks()` 方法仍然按照 `config.plugins` 数组的原始顺序注册 hooks，没有使用拓扑排序后的 tier 顺序。

**建议：** 将 `buildExecutionPlan` 的返回值（`ExecutionPlan.tiers`）实际用于 hook 注册的顺序，或者至少在 generate 阶段按 tier 顺序执行插件的 hooks。否则 `ioc.ts` 中实现的整套 DAG 调度（冲突检测、循环检测、拓扑排序、并行 tier 执行）都只是 dead code。

**涉及文件：** `packages/core/src/engine.ts` L134-138, `packages/core/src/ioc.ts`

#### 3. 缺少插件生命周期管理

**现状：** 插件没有 `init()` / `destroy()` 生命周期钩子。如果插件需要初始化资源（如数据库连接、HTTP 客户端、文件监听器），没有标准的方式来做。

**建议：** 在 `PluginDefinition` 中增加可选的 `setup(engine: Engine): Promise<void>` 和 `teardown(): Promise<void>` 生命周期方法。在 `Engine.init()` 和 `Engine.clean()` 中分别调用。

**涉及文件：** `packages/types/src/config.ts` (PluginDefinition), `packages/core/src/engine.ts`

#### 4. 插件缺少错误边界

**现状：** 如果任何一个插件的 middleware 抛出异常，整个构建流程就会中断。没有错误隔离机制。

**建议：** 在 Pipeline 的 `compose` 函数中或在 Engine 注册 hooks 时添加 try-catch 包装，提供结构化的错误报告（包含插件名称、hook 名称、错误详情），并支持配置 `continueOnError` 选项。

**涉及文件：** `packages/core/src/pipeline.ts`, `packages/core/src/engine.ts`

#### 5. 插件间通信只能靠 Context 上的隐式共享

**现状：** 插件 A 在 `ctx.entry` 上设置 `toc`，插件 B 需要读取时直接访问 `(ctx.entry as any).toc`。没有明确的数据依赖声明和验证。

**建议：** 结合 IoC 的 `produces`/`inject` 机制，在运行时验证：如果插件 B 声明了 `inject: ['post.toc']`，则在 B 执行时检查 `post.toc` 是否已由某个 producer 设置。如果未设置，给出明确的错误提示。

**涉及文件：** `packages/core/src/engine.ts`, `packages/core/src/ioc.ts`

------

### 二、主题系统（Theme System）

#### 6. Renderer 中的全局可变状态

**现状：** `renderer.ts:42` 使用模块级的 `let currentRenderContext` 作为渲染上下文，`Slot` 组件通过闭包读取它。这在并发渲染场景（如多个页面并行 SSR）中会产生竞态条件。

**建议：** 使用 Preact 的 Context API（`createContext` + `useContext`）或通过 props 传递渲染上下文，而不是依赖全局变量。即使当前是串行渲染，这也是更安全、更可测试的架构。

**涉及文件：** `packages/core/src/renderer.ts`

#### 7. WidgetRegistry 通过 `as any` 挂载到 Theme 上

**现状：** `engine.ts:293` 通过 `(theme as any).widgetRegistry = this.widgets` 将 widget registry 附加到 theme 对象上，然后在 layout 中通过 `theme?.__widgetRegistry` 访问。

**建议：** 在 `ResolvedTheme` 类型定义中正式加入 `widgetRegistry` 字段，或者将 widget registry 作为 PageContext 的一部分传递给 layout，这样 layout 中就不需要通过隐式属性来访问了。

**涉及文件：** `packages/types/src/theme.ts` (ResolvedTheme), `packages/core/src/engine.ts`, `themes/stellar/src/layouts/*.tsx`

#### 8. 每个 Layout 文件都单独通过 esbuild 编译

**现状：** `theme-loader.ts:229-256` 中，对于每个 `.tsx/.jsx/.ts` 文件，都会独立调用 `esbuild.build()`，创建临时文件再导入再删除。如果主题有 10 个 layout 文件，就要编译 10 次。

**建议：** 将所有 layout 文件（以及 theme config）合并为一次 esbuild 编译（使用 `entryPoints` 数组）。或者更好的方案是在 dev 模式下使用 Vite 的 `ssrLoadModule` 来利用 Vite 自身的编译能力，避免重复编译。

**涉及文件：** `packages/core/src/theme-loader.ts`

#### 9. Widget 的 configSchema 未使用真正的 Zod

**现状：** `themes/stellar` 中的 widget（如 tocWidget）手动实现了 `parse` 和 `safeParse` 方法来模拟 Zod 接口，而不是使用真正的 Zod schema。这意味着没有获得 Zod 的类型推导、验证细节、error formatting 等好处。

**建议：** 统一使用真正的 Zod schema 来定义 widget config，保持与 theme config 和 collection schema 的一致性。

**涉及文件：** `themes/stellar/src/theme.config.mjs`, `themes/stellar/src/widgets/*.tsx`

#### 10. 主题不支持热重载

**现状：** Vite plugin 只监听 `.md` 文件的变化。如果修改了 theme 的 layout 或 styles，需要手动重启 dev server。

**建议：** 扩展 Vite plugin 的文件监听范围，加入 theme 目录。当 layout/styles/config 变化时，触发主题重新加载和全量 render cache 失效。

**涉及文件：** `packages/vite-plugin/src/index.ts`, `packages/core/src/dev-session.ts`

------

### 三、构建流程（Pipeline/Flow）

#### 11. Load Pipeline 是串行执行的

**现状：** `engine.ts:177-179` 中，对每个 LoadContext 串行执行 `loadPipeline.run(ctx)`。但 Transform 阶段有 concurrency 控制。

**建议：** Load Pipeline 也应该支持并发执行，使用和 Transform 相同的 batch + `Promise.all` 模式。

**涉及文件：** `packages/core/src/engine.ts` L177-179

#### 12. `renderRoute` 在 dev 模式下仍会写入磁盘

**现状：** `engine.ts:383-398` 中，`renderRoute` 方法调用了 `emitRoutesWithTheme`，而 `emitRoutesWithTheme`（以及 `emitRoutes`）会将 HTML 写入磁盘。在 dev 模式下应该只返回 HTML 字符串而不写文件。

**建议：** 将"渲染为 HTML"和"写入磁盘"两个职责分离。提取一个纯渲染函数（不涉及文件 I/O），供 dev server 使用；emit 阶段单独处理文件写入。

**涉及文件：** `packages/core/src/engine.ts`, `packages/core/src/theme-emitter.ts`, `packages/core/src/emitter.ts`

#### 13. Dev 模式下每次文件变化都完整重建 SiteData

**现状：** `dev-session.ts:262` 中，每次 `handleFileChange` 都调用 `engine.generate(this.entries, this.singletonData)` 重建完整的 SiteData。对于只修改了一篇文章 body 的情况，这是不必要的开销。

**建议：** 区分 body-only change 和 frontmatter change。Body-only 时只更新该 entry 的 HTML，不需要重建 SiteData/routes。只有 frontmatter 变化（tags、categories、date 等）才需要重建。

**涉及文件：** `packages/core/src/dev-session.ts` L260-265

#### 14. Emit Pipeline 的 Hook 时机不明确

**现状：** `emit:before` 和 `emit:after` hook 在 `engine.ts:354-359` 中对每个 emitContext 执行，但此时 HTML 已经写入磁盘了（由 `emitRoutesWithTheme` 完成）。如果 `emit:before` hook 想修改 HTML（如 RSS 插件），修改后还需要再次写入磁盘。

**建议：** 将 emit pipeline 的执行移到写入磁盘之前，让 hook 有机会在写入前修改内容。或者重构为：render → pipeline hooks → write 的清晰顺序。

**涉及文件：** `packages/core/src/engine.ts` L330-364

------

### 四、类型系统（Type Safety）

#### 15. 大量 `as any` 类型断言

**现状：** 代码库中有大量 `as any` 使用：

- `engine.ts`: `(siteData as any)[name] = data`, `(siteData as any)[def.name] = createCollection(...)`
- `dev-session.ts`: `(e as any).tags`, `(e as any).categories`, `(e as any).date`, `(e as any).filePath`
- `renderer.ts`: `Slot` 组件的 props 类型
- 所有插件中的 entry 扩展

**建议：**

- 为 `SiteData` 增加泛型参数或使用 `Record<string, Collection | unknown>` 代替 index signature
- 创建类型守卫（type guards）如 `isPost(entry): entry is Post`
- 为 `Post` 类型增加缺失的字段（如 `filePath`），或在需要的地方使用更精确的类型

**涉及文件：** 几乎所有 core 文件和插件

#### 16. LayoutModule 的 props 完全是 `any`

**现状：** `LayoutModule.default` 类型是 `(props: any) => any`。Layout 组件接收的 context 完全没有类型约束。

**建议：** 使用 `PageContext | PostContext | ListContext | CollectionItemContext` 联合类型，或者至少用 `PageContext` 作为基础类型。结合 `typeLayoutMap` 的映射关系，可以在构建时验证 layout 组件是否接收了正确的 context 类型。

**涉及文件：** `packages/types/src/theme.ts` (LayoutModule)

------

### 五、性能优化

#### 17. DevSession 中 fileToEntryId 的匹配逻辑是启发式的

**现状：** `dev-session.ts:141-149` 中，通过比较文件名去掉日期前缀后的 slug 来匹配 entry，这是一个脆弱的启发式方法。如果有两个文件 slug 相同但日期不同，就会匹配错误。

**建议：** 在 `LoadContext` 或 `BaseEntry` 中保留源文件的绝对路径（`sourceFilePath`），建立文件路径到 entry ID 的精确映射。

**涉及文件：** `packages/types/src/content.ts` (BaseEntry), `packages/core/src/loader.ts`, `packages/core/src/dev-session.ts`

#### 18. Pipeline 缺少性能度量

**现状：** `Pipeline.run()` 没有计时或日志。无法知道哪个 middleware 耗时最长。CLI 的 `profile` 命令只能度量整体阶段，无法定位到具体插件。

**建议：** 在 Pipeline 中添加可选的 timing 支持（debug 模式下启用），记录每个 middleware 的执行时间，并在 `profile` 命令中展示。

**涉及文件：** `packages/core/src/pipeline.ts`

------

### 六、架构改进

#### 19. Engine 类职责过多（God Object）

**现状：** `Engine` 类（~540 行）承担了：pipeline 管理、plugin 注册、hook 注册、markdown 处理器构建、缓存管理、依赖追踪、主题解析、样式构建、文件输出 等所有职责。

**建议：** 考虑将部分职责提取为独立的可注入模块：

- `PluginManager`: 负责插件注册、DAG 构建、hook 注册
- `StyleManager`: 负责样式构建和管理
- `BuildOrchestrator`: 负责编排四阶段流程
- Engine 退化为组合这些模块的 Facade

这不需要一步完成，可以逐步重构。

**涉及文件：** `packages/core/src/engine.ts`

#### 20. 缺少结构化错误类型

**现状：** 所有错误都是 `new Error(message)`，没有错误代码、分类或结构化信息。用户/插件开发者无法 programmatically 处理特定类型的错误。

**建议：** 定义错误类层级：

- ```
  TitanError
  ```

   

  (base)

  - `ConfigError` (配置问题)
  - `PluginError` (插件错误，包含 pluginName)
  - `ThemeError` (主题错误)
  - `BuildError` (构建错误)
  - `ValidationError` (验证失败)

**涉及文件：** 新增 `packages/core/src/errors.ts`, `packages/types/src/errors.ts`

#### 21. 缺少事件/通知系统

**现状：** Engine 没有发出事件的能力。CLI 需要直接 import Engine 然后自己计时。Vite plugin 通过回调函数 (`onFileChange`) 获取通知，但这不是通用的。

**建议：** 引入 EventEmitter 或 typed event bus，让 Engine 在关键节点发出事件（`build:start`, `build:complete`, `entry:transformed`, `route:emitted` 等）。这样 CLI、Vite plugin、以及第三方集成都可以统一监听。

**涉及文件：** `packages/core/src/engine.ts`, `packages/types/src/config.ts`

------

### 七、总结优先级

| 优先级 | 建议                               | 影响                 |
| ------ | ---------------------------------- | -------------------- |
| **高** | #2 DAG 执行计划未使用              | 功能性 bug/dead code |
| **高** | #6 全局可变渲染状态                | 并发安全             |
| **高** | #7 WidgetRegistry 的 `as any` 挂载 | 类型安全             |
| **高** | #12 Dev 模式不应写磁盘             | 正确性               |
| **高** | #14 Emit hook 时序问题             | 插件行为正确性       |
| **中** | #1 插件类型安全                    | DX/可维护性          |
| **中** | #3 插件生命周期                    | 可扩展性             |
| **中** | #8 Layout 编译合并                 | 性能                 |
| **中** | #13 Dev 增量 SiteData              | 性能                 |
| **中** | #15 减少 `as any`                  | 可维护性             |
| **中** | #17 精确的文件-Entry 映射          | 正确性               |
| **中** | #19 Engine 拆分                    | 可维护性             |
| **中** | #20 结构化错误                     | DX                   |
| **低** | #4 插件错误边界                    | 健壮性               |
| **低** | #5 IoC 运行时验证                  | DX                   |
| **低** | #9 Widget 真正使用 Zod             | 一致性               |
| **低** | #10 主题热重载                     | DX                   |
| **低** | #11 Load 并发                      | 性能                 |
| **低** | #16 Layout props 类型              | 类型安全             |
| **低** | #18 Pipeline 性能度量              | 可观测性             |
| **低** | #21 事件系统                       | 可扩展性             |