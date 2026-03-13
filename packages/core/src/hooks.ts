/**
 * @neo-hexo/core — Hook System
 *
 * A strategy-based hook system inspired by Tapable, Vite, and Cordis.
 * Each Hook uses a `strategy` to determine execution behavior:
 *   - 'sequential'  — taps run one after another (for ordered/side-effect hooks)
 *   - 'parallel'    — taps run concurrently via Promise.all (for independent work)
 *   - 'waterfall'   — each tap transforms the value, passing it to the next
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type HookStrategy = 'sequential' | 'parallel' | 'waterfall';

export interface Disposable {
  dispose(): void;
}

export interface TapOptions {
  /** Tap name — used for debugging and identification. */
  name: string;
  /** Numeric priority. Lower = earlier. Default: 0. */
  priority?: number;
  /** Shorthand for priority grouping like Vite. 'pre' = -100, 'post' = 100. */
  enforce?: 'pre' | 'post';
}

interface TapEntry<Fn> {
  name: string;
  fn: Fn;
  priority: number;
}

// ─── Hook Class ──────────────────────────────────────────────────────────────

/**
 * Unified Hook class. The `strategy` determines how taps are executed.
 *
 * @typeParam Args — tuple of argument types passed to `call()`
 * @typeParam R   — return type (meaningful only for 'waterfall' strategy)
 */
export class Hook<Args extends unknown[] = [], R = void> {
  readonly name: string;
  readonly strategy: HookStrategy;

  private taps: TapEntry<(...args: Args) => R | Promise<R>>[] = [];
  private sorted = true;

  constructor(options: { name: string; strategy: HookStrategy }) {
    this.name = options.name;
    this.strategy = options.strategy;
  }

  /**
   * Register a tap (listener) on this hook.
   *
   * @returns A Disposable that removes the tap when disposed.
   */
  tap(
    nameOrOptions: string | TapOptions,
    fn: (...args: Args) => R | Promise<R>,
  ): Disposable {
    const opts = typeof nameOrOptions === 'string'
      ? { name: nameOrOptions }
      : nameOrOptions;

    let priority = opts.priority ?? 0;
    if (opts.enforce === 'pre') priority = Math.min(priority, -100);
    if (opts.enforce === 'post') priority = Math.max(priority, 100);

    const entry: TapEntry<(...args: Args) => R | Promise<R>> = {
      name: opts.name,
      fn,
      priority,
    };

    this.taps.push(entry);
    this.sorted = false;

    return {
      dispose: () => {
        const idx = this.taps.indexOf(entry);
        if (idx !== -1) this.taps.splice(idx, 1);
      },
    };
  }

  /**
   * Execute all taps according to the hook's strategy.
   *
   * - sequential: runs taps in priority order, awaiting each
   * - parallel:   runs all taps concurrently via Promise.all
   * - waterfall:  passes the first argument through each tap, returning the final value
   */
  async call(...args: Args): Promise<R> {
    this.ensureSorted();

    switch (this.strategy) {
      case 'sequential':
        return this.callSequential(args);
      case 'parallel':
        return this.callParallel(args);
      case 'waterfall':
        return this.callWaterfall(args);
    }
  }

  /** Returns true if no taps are registered. */
  get isEmpty(): boolean {
    return this.taps.length === 0;
  }

  /** Returns the number of registered taps. */
  get size(): number {
    return this.taps.length;
  }

  /** Remove all taps. */
  clear(): void {
    this.taps.length = 0;
  }

  // ─── Private Execution Methods ───────────────────────────────────────────

  private ensureSorted(): void {
    if (!this.sorted) {
      this.taps.sort((a, b) => a.priority - b.priority);
      this.sorted = true;
    }
  }

  private async callSequential(args: Args): Promise<R> {
    let result: R = undefined as R;
    for (const tap of this.taps) {
      result = await tap.fn(...args);
    }
    return result;
  }

  private async callParallel(args: Args): Promise<R> {
    const results = await Promise.all(this.taps.map((tap) => tap.fn(...args)));
    // Flatten arrays (e.g., generateRoutes returns Route[] from each tap)
    const flat = results.flatMap((r) => (Array.isArray(r) ? r : r != null ? [r] : []));
    return flat as R;
  }

  private async callWaterfall(args: Args): Promise<R> {
    // For waterfall, args[0] is the value threaded through.
    // Each tap receives (currentValue, ...restArgs) and returns a new value.
    const restArgs = args.slice(1) as unknown[];
    let current: unknown = args[0];

    for (const tap of this.taps) {
      const callArgs = [current, ...restArgs] as unknown as Args;
      current = await tap.fn(...callArgs);
    }

    return current as R;
  }
}
