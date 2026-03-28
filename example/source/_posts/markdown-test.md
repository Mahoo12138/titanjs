---
title: Markdown 渲染测试
date: 2024-02-01
tags:
  - markdown
  - test
categories:
  - 技术
---

# Markdown 渲染测试

本文测试各种 Markdown 语法的渲染效果，涵盖 GFM（GitHub Flavored Markdown）扩展语法。

---

## 文本格式

这是一段普通文本。包含 **粗体**、*斜体*、~~删除线~~ 和 `行内代码`。

还可以组合使用：***粗斜体***、**~~粗体删除线~~**、*~~斜体删除线~~*。

上标与下标（HTML）：H<sub>2</sub>O 和 E = mc<sup>2</sup>。

<kbd>Ctrl</kbd> + <kbd>C</kbd> 复制，<kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴。

---

## 标题层级

标题从 H1 到 H6 逐级递减，以下展示 H3 ~ H6：

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

---

## 链接与图片

### 普通链接

- 行内链接：[Titan 官网](https://example.com)
- 带 title：[Titan 文档](https://example.com/docs "查看文档")
- 自动链接：https://example.com

### 图片

![示例图片](https://picsum.photos/seed/titan/800/400 "随机示例图")

---

## 列表

### 无序列表

- 项目一
- 项目二
  - 子项目 A
  - 子项目 B
    - 更深层嵌套
- 项目三

### 有序列表

1. 第一步：安装依赖
2. 第二步：配置项目
3. 第三步：运行构建
   1. 子步骤 3.1
   2. 子步骤 3.2

### 任务列表（GFM）

- [x] 完成项目初始化
- [x] 配置 TypeScript
- [ ] 编写单元测试
- [ ] 发布第一个版本

---

## 引用

> 显式 > 隐式
> 组合 > 继承
> 契约 > 约定

嵌套引用：

> 外层引用
>
> > 内层引用 — 这是嵌套的 blockquote。
>
> 回到外层。

---

## 表格（GFM）

### 基本表格

| 模块 | 选型 | 原因 |
|------|------|------|
| 语言 | TypeScript | 类型即文档 |
| 构建 | tsup | 零配置 |
| 测试 | Vitest | 生态一致 |
| 运行时 | Node.js | 生态最大 |

### 对齐方式

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:--------:|-------:|
| AAAA | BBBB | CCCC |
| 一 | 二二二二 | 三 |
| 长文本测试左 | 长文本测试中 | 长文本测试右 |

### 表格内格式

| 功能 | 语法 | 渲染效果 |
|------|------|----------|
| 粗体 | `**text**` | **text** |
| 斜体 | `*text*` | *text* |
| 代码 | `` `code` `` | `code` |
| 链接 | `[link](url)` | [link](https://example.com) |
| 删除线 | `~~text~~` | ~~text~~ |

---

## 代码

### 行内代码

使用 `const x = 42` 声明变量，调用 `console.log(x)` 输出结果。

### 代码块

```typescript
interface Config {
  title: string
  url: string
  theme: string
  markdown: {
    remarkPlugins: Plugin[]
    rehypePlugins: Plugin[]
  }
}

function createSite(config: Config): Site {
  const engine = new Engine(config)
  return engine.build()
}
```

```css
/* 渐变文字效果 */
.article-title {
  font-weight: 800;
  letter-spacing: -0.025em;
  background: linear-gradient(135deg, #e8e8e8 60%, #999);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

```bash
# 安装并运行
pnpm install
pnpm dev
```

```json
{
  "name": "@titan/core",
  "version": "0.0.1",
  "type": "module",
  "dependencies": {
    "unified": "^11.0.0",
    "remark-gfm": "^4.0.0"
  }
}
```

---

## 水平线

三种写法：

---

***

___

---

## 数学公式（如果支持）

行内公式：质能方程 $E = mc^2$。

块级公式：

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

---

## HTML 内联

<details>
<summary>点击展开详情</summary>

这是折叠内容。支持 **Markdown** 格式。

- 列表项 A
- 列表项 B

</details>

<div style="padding: 1em; border-left: 4px solid #e8854a; background: rgba(232,133,74,0.1); border-radius: 0 8px 8px 0; margin: 1em 0;">
  ⚠️ 这是一个使用内联 HTML 的自定义提示框。
</div>

---

## 脚注（如果支持）

这里有一个脚注引用[^1]，还有另一个[^note]。

[^1]: 这是第一个脚注的内容。
[^note]: 这是命名脚注的内容，可以包含 **格式** 和 `代码`。

---

## 特殊字符与转义

- 反斜杠转义：\*不是斜体\*、\`不是代码\`
- HTML 实体：&amp; &lt; &gt; &copy; &mdash;
- Emoji（Unicode）：🚀 ✨ 🎨 ⚡ 🔧
- 中文标点测试：「引号」、《书名号》、——破折号——

---

## 长文本段落

Titan 是一个现代化的静态站点生成器，采用 TypeScript 编写，基于 Preact JSX 模板引擎。它的设计哲学是"类型即文档、约定优于配置"，通过插件化的架构支持博客、维基、笔记本等多种内容类型。Titan 的渲染管线采用四阶段洋葱中间件模型——加载（Load）、转换（Transform）、生成（Generate）、输出（Emit）——每个阶段都可以通过插件进行拦截和扩展。

> "好的工具应该像空气一样：你不会注意到它的存在，但没有它你无法呼吸。" —— 某位不愿透露姓名的工程师

以上就是全部 Markdown 渲染测试内容。
