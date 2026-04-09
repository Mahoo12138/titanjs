## Plan: Titan Dev Server 按需编译与精准 HMR

重构目标是将当前 CLI 的静态文件服务器模式替换为 Vite 驱动的开发内核，构建 Titan 专用的按需页面编译与路由级 HMR 协调器。生产 build 保持全量流水线，开发模式实现“首次访问才生成页面 + Markdown/Frontmatter 精准重渲染 + 受影响联动页最小刷新”，优先保证冷启动速度和编辑反馈速度。

**Steps**
1. Phase 1 - Baseline 与接口切分（阻塞后续）: 在 core 层定义新的 Dev API 边界，拆分现有单体 Engine.build() 为可复用子能力（加载索引、单条目变换、路由渲染、输出写入），并保留现有 build 流程行为一致。*后续全部依赖此步骤*
2. 设计 Engine 的开发态会话对象 DevSession（或等价命名）: 负责持有内容索引、路由映射、依赖图、缓存句柄、markdown processor、theme 实例；提供 init()、renderOnDemand(url)、handleFileChange(filePath)、collectAffectedRoutes(entryId) 等方法。*depends on 1*
3. Phase 2 - CLI dev 启动路径重构: 将 packages/cli 的 dev 命令从 node:http 静态服务器替换为 Vite createServer，挂载 Titan 中间件；启动阶段只做“轻量索引构建 + 主题与插件装配 + 路由清单元信息”，不做全量 HTML emit。*depends on 2*
4. 接入并改造现有 @titan/vite-plugin: 将插件改为实例化可更新状态（asset imports、changed routes、invalidations），去掉当前空实现 setAssetImports，改为通过 DevSession 的订阅回调更新虚拟模块与 HMR 通知。*parallel with 3, but finalized after 3*
5. Phase 3 - 按需编译（首访生成）: 实现 Vite 中间件中对 HTML 请求的拦截，命中 Titan 内容路由时调用 DevSession.renderOnDemand(url)；若缓存有效直接返回内存/磁盘结果，未命中则仅构建该页面及必需上下文。列表页按“首次访问生成”策略延迟编译。*depends on 2 and 3*
6. 构建开发态缓存层: 区分 entry 级缓存（markdown→entry）、route 级缓存（entry/siteData→html）、render 依赖缓存（layout hash、singleton hash）；缓存失效以最小粒度进行。*depends on 5*
7. Phase 4 - 精准 HMR 管线: 在 Vite watcher 中识别 markdown 文件变更，执行前后快照 diff（frontmatter 与 body 分离）；body 变化触发当前 entry 页面重渲染，frontmatter 变化再额外计算联动路由（tag/category/archive/index/prev-next 邻居）并仅刷新受影响路由。*depends on 2 and 5*
8. 实现受影响路由传播算法: 基于 DependencyTracker 扩展 entry->route、route->entry、tag/category 反向索引，在 handleFileChange 时输出 changedRoutes 集合；发送 Vite ws 的自定义事件并对对应虚拟模块做 moduleGraph 定点失效，避免 full-reload。*depends on 7*
9. Phase 5 - Build 命令与兼容性: build 继续走全量，但复用重构后子模块，确保结果一致；保留 --no-cache 语义。info/profile 适配新 API（不改变用户命令面）。*depends on 1*
10. Phase 6 - 可观测性与回退策略: 新增调试日志与统计（按需渲染耗时、命中率、单文件变更触发的路由数）；当依赖图异常或插件声明不足时自动回退到页面级 full-reload（不是全站）。*depends on 7 and 8*
11. Phase 7 - 测试与验收: 增补 core 与 cli 集成测试，覆盖冷启动耗时、首次访问编译、Markdown 精准 HMR、Frontmatter 级联更新、主题/插件改动时回退行为。*depends on 3-10*

**Relevant files**
- /Users/mahoo/Projects/titanjs/packages/cli/src/index.ts — dev 命令改为 Vite server 启动与 Titan 中间件挂载；build/profile/info 适配新 core API
- /Users/mahoo/Projects/titanjs/packages/vite-plugin/src/index.ts — 虚拟模块、watcher、module invalidate、ws 事件派发重写
- /Users/mahoo/Projects/titanjs/packages/core/src/engine.ts — 抽离 build 子流程并新增开发态会话接口
- /Users/mahoo/Projects/titanjs/packages/core/src/dependency-tracker.ts — 增加 route 级索引与 entry-route 关联追踪
- /Users/mahoo/Projects/titanjs/packages/core/src/loader.ts — 提供轻量索引扫描能力（不触发全量 transform）
- /Users/mahoo/Projects/titanjs/packages/core/src/transformer.ts — 暴露单条目 transform API，区分 frontmatter/body 影响范围
- /Users/mahoo/Projects/titanjs/packages/core/src/generator.ts — 提供局部路由重算入口（按 entry 或 tag/category 范围）
- /Users/mahoo/Projects/titanjs/packages/core/src/theme-emitter.ts — 支持单路由渲染与最小上下文重组
- /Users/mahoo/Projects/titanjs/packages/core/src/cache.ts — 区分 dev/build cache namespace，避免互相污染
- /Users/mahoo/Projects/titanjs/packages/core/test/engine.test.ts — 增加 DevSession 与局部重建测试
- /Users/mahoo/Projects/titanjs/packages/cli/test (新建) — 端到端 dev/HMR 行为测试

**Verification**
1. 冷启动: 启动 dev 后在未访问任何页面前，不执行全量 transform/emit；通过日志与计数断言仅完成索引初始化。
2. 首次访问按需编译: 首次请求某 post 页面时只编译该页面；访问另一个页面时新增编译次数为 1，非全量。
3. Markdown 正文变更: 编辑单篇文件 body，仅该页面和必要邻接页面触发热更新；浏览器不全局刷新。
4. Frontmatter 变更: 修改 title/tags/date 后，当前页 + 相关列表页/tag 页/archive 页精准更新；不触发无关路由。
5. 主题/布局变更: 仅引用该布局的页面失效并重渲染，其他页面保持。
6. 插件钩子兼容: 现有 transform/generate/emit 插件在 dev 与 build 输出一致（忽略时间戳等非确定字段）。
7. 生产 build 回归: 与重构前输出总路由数、关键页面 HTML 结构一致，性能不回退。

**Decisions**
- 已确认: build 维持全量语义；优化重点放在 dev 冷启动与按需编译。
- 已确认: dev 路由采用“内容页优先 + 列表页首访生成”策略。
- 已确认: Frontmatter 更新必须级联到联动页，并保持精准刷新。
- 范围外: 本轮不引入 SSR streaming、不做远程 CMS 增量协议改造。

**Further Considerations**
1. 对未声明依赖的第三方插件，建议默认降级为该插件影响范围内的页面级刷新，避免误判导致脏数据。
2. 建议在 info 新增 dev graph 诊断开关（例如显示某文件变更会影响哪些路由），方便后续调优。