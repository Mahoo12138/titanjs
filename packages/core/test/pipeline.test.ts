import { describe, it, expect } from 'vitest'
import { Pipeline, compose } from '../src/pipeline.js'

describe('Pipeline', () => {
  it('should run middlewares in onion order', async () => {
    const order: string[] = []
    const pipeline = new Pipeline<{ value: string }>()

    pipeline.use(async (ctx, next) => {
      order.push('A:before')
      await next()
      order.push('A:after')
    })

    pipeline.use(async (ctx, next) => {
      order.push('B:before')
      await next()
      order.push('B:after')
    })

    pipeline.use(async (ctx, next) => {
      order.push('C')
      await next()
    })

    await pipeline.run({ value: 'test' })

    expect(order).toEqual(['A:before', 'B:before', 'C', 'B:after', 'A:after'])
  })

  it('should allow middleware to modify context', async () => {
    const pipeline = new Pipeline<{ value: number }>()

    pipeline.use(async (ctx, next) => {
      ctx.value += 10
      await next()
    })

    pipeline.use(async (ctx, next) => {
      ctx.value *= 2
      await next()
    })

    const ctx = { value: 1 }
    await pipeline.run(ctx)

    expect(ctx.value).toBe(22) // (1 + 10) * 2
  })

  it('should handle empty pipeline', async () => {
    const pipeline = new Pipeline<{ value: string }>()
    const ctx = { value: 'unchanged' }
    await pipeline.run(ctx)
    expect(ctx.value).toBe('unchanged')
  })

  it('should short-circuit when next is not called', async () => {
    const order: string[] = []
    const pipeline = new Pipeline<{}>()

    pipeline.use(async (_ctx, _next) => {
      order.push('A')
      // intentionally not calling next()
    })

    pipeline.use(async (_ctx, _next) => {
      order.push('B') // should never be reached
    })

    await pipeline.run({})

    expect(order).toEqual(['A'])
  })

  it('should throw if next() is called multiple times', async () => {
    const pipeline = new Pipeline<{}>()

    pipeline.use(async (_ctx, next) => {
      await next()
      await next()
    })

    await expect(pipeline.run({})).rejects.toThrow('next() called multiple times')
  })
})
