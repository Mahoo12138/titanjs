---
notebook: dev-notes
title: TypeScript 类型体操入门
tags:
  - Programming/TypeScript
  - Concepts
pin: false
---

# TypeScript 类型体操入门

TypeScript 的类型系统是图灵完备的，可以进行复杂的类型操作。

## 基础工具类型

```ts
// Pick: 选取部分属性
type UserName = Pick<User, 'name' | 'email'>

// Omit: 排除部分属性
type UserWithoutPassword = Omit<User, 'password'>

// Partial: 全部可选
type PartialUser = Partial<User>
```

## 条件类型

```ts
type IsString<T> = T extends string ? true : false
type A = IsString<'hello'> // true
type B = IsString<42>      // false
```
