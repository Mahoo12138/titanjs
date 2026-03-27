---
wiki: titanjs
title: 主题开发
order: 4
section: 进阶
---

# 主题开发

TitanJS 主题使用 Preact JSX 编写布局，支持 Widget 系统。

## 主题结构

```
themes/my-theme/
├── theme.config.mjs   # 主题配置
├── layouts/           # JSX 布局
│   ├── default.jsx
│   └── post.jsx
├── widgets/           # 侧边栏小部件
│   ├── toc.mjs
│   └── recent.mjs
├── components/        # 共享组件
│   ├── PostCard.jsx
│   └── Paginator.jsx
└── styles/            # CSS 样式
    ├── tokens.css
    └── global.css
```

## Widget 系统

Widget 通过 `theme.config.mjs` 注册，在 `siteTree` 中引用：

```js
export default {
  widgets: [tocWidget, recentWidget],
  siteTree: {
    post: {
      leftbar: ['recent'],
      rightbar: ['toc'],
    },
  },
}
```
