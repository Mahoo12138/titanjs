---
wiki: titanjs
title: 快速开始
order: 1
projectTitle: TitanJS 文档
projectDescription: 下一代静态站点生成框架
projectIcon: 🚀
projectSort: 1
tags:
  - 框架
  - SSG
section: 基础
---

# 快速开始

欢迎使用 TitanJS！本文将帮助你快速搭建一个静态站点。

## 安装

```bash
npm create titan@latest my-site
cd my-site
npm install
```

## 项目结构

```
my-site/
├── source/
│   ├── _posts/       # 博客文章
│   └── _pages/       # 独立页面
├── themes/           # 主题目录
├── titan.config.js   # 配置文件
└── package.json
```

## 启动开发服务器

```bash
npx titan dev
```

访问 `http://localhost:3000` 即可预览站点。
