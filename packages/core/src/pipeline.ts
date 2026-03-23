/**
 * Pipeline implementation - Onion middleware model
 *
 * Each pipeline stage is an independent middleware stack.
 * Middleware functions are composed in order and executed
 * with the onion model (each calls next() to proceed).
 */
import type { Middleware, Pipeline as IPipeline } from '@titan/types'

export class Pipeline<Ctx> implements IPipeline<Ctx> {
  private middlewares: Middleware<Ctx>[] = []

  use(middleware: Middleware<Ctx>): this {
    this.middlewares.push(middleware)
    return this
  }

  async run(ctx: Ctx): Promise<void> {
    await compose(this.middlewares)(ctx)
  }
}

/**
 * Compose middlewares into a single function (onion model).
 * Each middleware receives ctx and a next() function.
 * Calling next() passes control to the next middleware.
 */
function compose<Ctx>(middlewares: Middleware<Ctx>[]): (ctx: Ctx) => Promise<void> {
  return async (ctx: Ctx) => {
    let index = -1

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      const fn = middlewares[i]
      if (!fn) return

      await fn(ctx, () => dispatch(i + 1))
    }

    await dispatch(0)
  }
}

export { compose }
