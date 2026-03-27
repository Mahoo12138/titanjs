---
title: Tag Plugins 演示
date: 2026-04-08 10:00:00
tags:
  - 教程
  - Tag Plugins
---

本文演示 Titan 的 Tag Plugin（标签插件）功能，基于 remark-directive 语法。

<!-- more -->

## Note / Box

:::note{color=blue title="提示"}
这是一个蓝色的提示框，适合放置提示信息。
:::

:::note{color=yellow title="注意"}
黄色表示需要注意的内容。
:::

:::note{color=red title="警告"}
红色表示危险操作或重要警告。
:::

:::box{color=green title="成功"}
操作已成功完成！
:::

## Tabs

:::tabs
::tab{title="npm"}
```bash
npm install @titan/core
```
::tab{title="pnpm"}
```bash
pnpm add @titan/core
```
::tab{title="yarn"}
```bash
yarn add @titan/core
```
:::

## Timeline

:::timeline
::node{title="2026-01 设计阶段"}
完成 Titan 框架整体架构设计，确定技术选型。
::node{title="2026-02 核心引擎" color=green}
实现四阶段 Pipeline、缓存系统、CLI 基础命令。
::node{title="2026-03 插件与主题"}
完成插件系统（Collection/Singleton/IoC）和 Preact 主题系统。
::node{title="2026-04 Tag Plugins" color=green}
移植 Stellar 的 Tag Plugin 体系为 remark 插件。
:::

## Folding

:::folding{title="点击展开详细配置"}
```js
// titan.config.js
export default {
  title: 'My Site',
  plugins: [pluginTagPlugins()],
}
```
:::

## Grid

:::grid{cols=3}
::cell
**第一列**：支持 Markdown 内容
::cell
**第二列**：自动等宽排列
::cell
**第三列**：响应式布局
:::

:::grid{cols=2}
::cell
左侧内容
::cell{span=1}
右侧内容
:::

## Image

::image{src="/photo.jpg" alt="示例图片" caption="这是一张示例图片的说明文字"}

## Link

::link{href="https://github.com" title="GitHub" desc="全球最大的代码托管平台" icon="fab fa-github"}

## Button

::button{href="/getting-started" text="快速开始" color=green size=lg}

::button{href="/docs" text="查看文档" color=purple size=md}

## Copy

复制安装命令：::copy{text="pnpm add @titan/core"}

## 内联标签

这段文字中包含 :mark[高亮内容]{color=yellow}，以及 :mark[红色标记]{color=red}。

当前版本：:badge[v0.1.0]{color=blue} :badge[Beta]{color=orange}

标签：:hashtag[TypeScript] :hashtag[SSG] :hashtag[Preact]

快捷键：:kbd[Ctrl] + :kbd[C] 复制，:kbd[Ctrl] + :kbd[V] 粘贴。

任务列表：
- :checkbox[完成设计文档]{checked}
- :checkbox[实现核心引擎]{checked}
- :checkbox[编写测试]
- :checkbox[发布 v0.1]
