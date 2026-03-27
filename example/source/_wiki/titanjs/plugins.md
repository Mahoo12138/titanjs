---
wiki: titanjs
title: 插件开发
order: 3
section: 进阶
---

# 插件开发

TitanJS 的插件系统基于 Collection/Singleton 模型。

## 插件结构

```ts
import type { PluginDefinition } from '@titan/types'

export function myPlugin(): PluginDefinition {
  return {
    name: 'my-plugin',
    collections: [
      {
        name: 'gallery',
        source: '_gallery/**/*.md',
        schema: z.object({
          title: z.string(),
          image: z.string(),
        }),
      },
    ],
    hooks: {
      'generate:after'(ctx) {
        // 在生成阶段后做自定义操作
      },
    },
  }
}
```

## 生命周期钩子

TitanJS 提供以下钩子：

- `load:before` / `load:after`
- `transform:entry` / `transform:post` / `transform:page`
- `generate:before` / `generate:routes` / `generate:after`
- `emit:before` / `emit:after`
