---
notebook: dev-notes
title: JavaScript 闭包详解
tags:
  - Programming/JavaScript
  - Concepts
pin: true
notebookTitle: 开发笔记
notebookDescription: 日常开发中的学习笔记
notebookIcon: 📝
---

# JavaScript 闭包详解

闭包是指函数能够记住并访问其词法作用域，即使该函数在其词法作用域之外执行。

## 基本示例

```js
function outer() {
  let count = 0
  return function inner() {
    count++
    return count
  }
}

const counter = outer()
console.log(counter()) // 1
console.log(counter()) // 2
```

## 常见应用场景

- 数据封装和私有变量
- 函数工厂
- 回调函数和事件处理
- 模块模式
