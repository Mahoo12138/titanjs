---
wiki: titanjs
title: 配置指南
order: 2
section: 基础
---

# 配置指南

TitanJS 使用 `titan.config.js` 进行项目配置。

## 基本配置

```js
export default {
  title: '我的站点',
  description: '一个 TitanJS 站点',
  url: 'https://example.com',
  language: 'zh-CN',
}
```

## 插件配置

通过 `plugins` 数组注册插件：

```js
import { pluginRss } from '@titan/plugin-rss'
import { pluginSitemap } from '@titan/plugin-sitemap'

export default {
  plugins: [
    pluginRss(),
    pluginSitemap(),
  ],
}
```

## 主题配置

使用 `theme` 字段指定主题目录：

```js
export default {
  theme: './themes/stellar',
}
```
