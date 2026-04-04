/**
 * Pipeline implementation - Onion middleware model
 *
 * Each pipeline stage is an independent middleware stack.
 * Middleware functions are composed in order and executed
 * with the onion model (each calls next() to proceed).
 */
import type { Middleware, Pipeline as IPipeline } from '@titan/types'

/** Timing entry for a single middleware execution */
export interface MiddlewareTiming {
  name: string
  durationMs: number
}

export class Pipeline<Ctx> implements IPipeline<Ctx> {
  private middlewares: Array<{ fn: Middleware<Ctx>; name: string }> = []
  private _timings: MiddlewareTiming[] = []
  private _debug = false

  // Pre-compiled dispatch function (invalidated on use())
  private _compiled: ((ctx: Ctx) => Promise<void>) | null = null

  /**
   * Enable debug mode to record per-middleware timing.
   */
  enableDebug(enabled = true): this {
    this._debug = enabled
    this._compiled = null
    return this
  }

  /**
   * Get recorded timings (only populated when debug is enabled).
   * Call clearTimings() before a run to get timings for just that run.
   */
  get timings(): readonly MiddlewareTiming[] {
    return this._timings
  }

  /**
   * Clear accumulated timing data.
   */
  clearTimings(): void {
    this._timings = []
  }

  use(middleware: Middleware<Ctx>): this {
    const name = middleware.name || `middleware[${this.middlewares.length}]`
    this.middlewares.push({ fn: middleware, name })
    this._compiled = null // invalidate pre-compiled function
    return this
  }

  async run(ctx: Ctx): Promise<void> {
    if (this._debug) {
      // Debug mode always rebuilds to capture per-call timing
      await composeWithTiming(this.middlewares, this._timings)(ctx)
    } else {
      if (!this._compiled) {
        this._compiled = compose(this.middlewares.map(m => m.fn))
      }
      await this._compiled(ctx)
    }
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

/**
 * Compose with per-middleware timing measurement.
 */
function composeWithTiming<Ctx>(
  middlewares: Array<{ fn: Middleware<Ctx>; name: string }>,
  timings: MiddlewareTiming[],
): (ctx: Ctx) => Promise<void> {
  return async (ctx: Ctx) => {
    let index = -1

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error('next() called multiple times')
      }
      index = i

      const entry = middlewares[i]
      if (!entry) return

      const start = performance.now()
      await entry.fn(ctx, () => dispatch(i + 1))
      const elapsed = performance.now() - start

      timings.push({ name: entry.name, durationMs: Math.round(elapsed * 100) / 100 })
    }

    await dispatch(0)
  }
}

export { compose }
