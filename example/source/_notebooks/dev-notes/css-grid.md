---
notebook: dev-notes
title: CSS Grid 布局笔记
tags:
  - Frontend/CSS
pin: false
---

# CSS Grid 布局笔记

CSS Grid 是二维布局系统，适合页面整体布局。

## 基本用法

```css
.container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
```

## 常用属性

| 属性 | 说明 |
|------|------|
| `grid-template-columns` | 定义列 |
| `grid-template-rows` | 定义行 |
| `gap` | 间距 |
| `grid-area` | 命名区域 |

## 响应式技巧

```css
.grid {
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
```
