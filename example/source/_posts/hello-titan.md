---
title: Hello Titan
date: 2024-01-15
tags:
  - titan
  - ssg
categories:
  - 技术
---

# Hello Titan

这是第一篇使用 Titan SSG 构建的文章。

## 特性

Titan 是一个面向现代前端生态的新一代静态站点生成框架：

- **四阶段 Pipeline** — Load → Transform → Generate → Emit
- **文章级并发** — 充分利用多核 CPU
- **文件系统缓存** — 增量构建，毫秒级重建
- **强类型** — TypeScript 全链路，类型即文档

## 代码示例

```typescript
import { defineConfig } from 'titan'

export default defineConfig({
  title: 'My Site',
  url: 'https://example.com',
  language: 'zh-CN',
})
```

## 下一步

> Titan 的价值在内容管道和插槽机制，不在 UI 运行时。

期待更多功能的到来！
