/**
 * PluginManager - Manages plugin registration, DAG-based hook ordering,
 * lifecycle (setup/teardown), and error boundaries.
 *
 * Extracted from Engine to separate plugin orchestration concerns.
 */
import type {
  TitanConfig,
  PluginDefinition,
  LoadContext,
  TransformContext,
  GenerateContext,
  EmitContext,
  Middleware,
  PluginSetupContext,
} from '@titan/types'
import { PluginError } from '@titan/types'
import type { Pipeline } from './pipeline.js'
import type { CollectionRegistry } from './collection-registry.js'
import type { SingletonRegistry } from './singleton-registry.js'
import type { BlockRegistry } from './block-registry.js'
import type { ExecutionPlan } from './ioc.js'
import { buildExecutionPlan } from './ioc.js'

export interface Pipelines {
  load: Pipeline<LoadContext>
  transform: Pipeline<TransformContext>
  generate: Pipeline<GenerateContext>
  emit: Pipeline<EmitContext>
}

export class PluginManager {
  private plugins: PluginDefinition[]
  private executionPlan: ExecutionPlan | null = null

  constructor(plugins: PluginDefinition[]) {
    this.plugins = plugins
  }

  /**
   * Register collections, singletons, and blocks declared by plugins.
   */
  registerContent(
    collections: CollectionRegistry,
    singletons: SingletonRegistry,
    blocks?: BlockRegistry,
  ): void {
    for (const plugin of this.plugins) {
      for (const col of plugin.collections ?? []) {
        collections.register(col)
      }
      for (const s of plugin.singletons ?? []) {
        singletons.register(s)
      }
      if (blocks) {
        for (const b of plugin.blocks ?? []) {
          blocks.register(b)
        }
      }
    }
  }

  /**
   * Build execution plan using IoC DAG and register plugin hooks
   * into the provided pipelines in topological tier order.
   * Each hook is wrapped with error boundary that reports plugin name and hook name.
   */
  buildPlanAndRegisterHooks(pipelines: Pipelines): void {
    this.executionPlan = buildExecutionPlan(this.plugins)

    for (const tier of this.executionPlan.tiers) {
      for (const plugin of tier) {
        if (!plugin.hooks) continue

        const wrap = <Ctx>(hookName: string, fn: Middleware<Ctx>): Middleware<Ctx> => {
          return async (ctx, next) => {
            try {
              await fn(ctx, next)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              throw new PluginError(
                plugin.name,
                `Failed in hook "${hookName}": ${message}`,
                { cause: err, hookName },
              )
            }
          }
        }

        if (plugin.hooks['load:before']) pipelines.load.use(wrap('load:before', plugin.hooks['load:before']))
        if (plugin.hooks['load:after']) pipelines.load.use(wrap('load:after', plugin.hooks['load:after']))
        if (plugin.hooks['transform:entry']) pipelines.transform.use(wrap('transform:entry', plugin.hooks['transform:entry']))
        if (plugin.hooks['generate:before']) pipelines.generate.use(wrap('generate:before', plugin.hooks['generate:before']))
        if (plugin.hooks['generate:routes']) pipelines.generate.use(wrap('generate:routes', plugin.hooks['generate:routes']))
        if (plugin.hooks['generate:after']) pipelines.generate.use(wrap('generate:after', plugin.hooks['generate:after']))
        if (plugin.hooks['emit:before']) pipelines.emit.use(wrap('emit:before', plugin.hooks['emit:before']))
        if (plugin.hooks['emit:after']) pipelines.emit.use(wrap('emit:after', plugin.hooks['emit:after']))
      }
    }
  }

  /**
   * Run setup lifecycle hooks for all plugins that define them.
   */
  async runSetup(context: PluginSetupContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.setup) {
        await plugin.setup(context)
      }
    }
  }

  /**
   * Run teardown lifecycle hooks for all plugins that define them.
   */
  async runTeardown(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.teardown) {
        await plugin.teardown()
      }
    }
  }

  /**
   * Collect remark/rehype plugins from all plugins.
   */
  collectMarkdownPlugins(): { remarkPlugins: unknown[]; rehypePlugins: unknown[] } {
    const remarkPlugins: unknown[] = []
    const rehypePlugins: unknown[] = []
    for (const plugin of this.plugins) {
      if (plugin.remarkPlugins) remarkPlugins.push(...plugin.remarkPlugins)
      if (plugin.rehypePlugins) rehypePlugins.push(...plugin.rehypePlugins)
    }
    return { remarkPlugins, rehypePlugins }
  }

  getPlugins(): PluginDefinition[] {
    return this.plugins
  }
}
