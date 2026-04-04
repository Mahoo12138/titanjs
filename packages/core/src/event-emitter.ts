/**
 * Typed Event Emitter for TitanJS
 *
 * Provides a type-safe event bus that Engine emits events on
 * at key lifecycle points. CLI, Vite plugin, and third-party
 * integrations can listen to these events.
 */

/** Event map defining all Engine lifecycle events and their payloads */
export interface TitanEventMap {
  'build:start': { rootDir: string }
  'build:complete': { entries: number; routes: number; elapsed: number }
  'load:start': { sourceDir: string }
  'load:complete': { fileCount: number }
  'transform:start': { entryCount: number }
  'transform:complete': { entryCount: number }
  'generate:start': {}
  'generate:complete': { routeCount: number }
  'emit:start': { routeCount: number }
  'emit:complete': { routeCount: number }
  'entry:transformed': { entryId: string; contentType: string }
  'route:emitted': { url: string; outputPath: string }
  'theme:loaded': { themeName: string }
  'plugin:error': { pluginName: string; hookName: string; error: Error }
}

export type TitanEventName = keyof TitanEventMap

export type TitanEventHandler<K extends TitanEventName> = (payload: TitanEventMap[K]) => void

export class TitanEventEmitter {
  private handlers = new Map<string, Set<Function>>()

  /**
   * Register an event listener.
   */
  on<K extends TitanEventName>(event: K, handler: TitanEventHandler<K>): this {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return this
  }

  /**
   * Remove an event listener.
   */
  off<K extends TitanEventName>(event: K, handler: TitanEventHandler<K>): this {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  /**
   * Register a one-time event listener.
   */
  once<K extends TitanEventName>(event: K, handler: TitanEventHandler<K>): this {
    const wrapper = ((payload: TitanEventMap[K]) => {
      handler(payload)
      this.off(event, wrapper)
    }) as TitanEventHandler<K>
    return this.on(event, wrapper)
  }

  /**
   * Emit an event to all registered handlers.
   */
  emit<K extends TitanEventName>(event: K, payload: TitanEventMap[K]): void {
    const handlers = this.handlers.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      handler(payload)
    }
  }

  /**
   * Remove all listeners (or all listeners for a specific event).
   */
  removeAllListeners(event?: TitanEventName): void {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
  }
}
