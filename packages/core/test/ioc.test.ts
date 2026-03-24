import { describe, it, expect } from 'vitest'
import { buildExecutionPlan, executePluginPlan } from '../src/ioc.js'
import type { PluginDefinition } from '@titan/types'

function makePlugin(name: string, overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return { name, ...overrides }
}

describe('IoC Container + DAG', () => {
  describe('buildExecutionPlan', () => {
    it('should handle plugins with no dependencies', () => {
      const plugins = [
        makePlugin('a'),
        makePlugin('b'),
        makePlugin('c'),
      ]

      const plan = buildExecutionPlan(plugins)

      // All in one tier (can run in parallel)
      expect(plan.tiers).toHaveLength(1)
      expect(plan.tiers[0]).toHaveLength(3)
    })

    it('should order plugins by dependencies', () => {
      const plugins = [
        makePlugin('a', { produces: ['readingTime'] }),
        makePlugin('b', { produces: ['toc'] }),
        makePlugin('c', { inject: ['readingTime', 'toc'] }),
      ]

      const plan = buildExecutionPlan(plugins)

      // Tier 1: a, b (no deps) | Tier 2: c (depends on a, b)
      expect(plan.tiers).toHaveLength(2)
      expect(plan.tiers[0].map(p => p.name).sort()).toEqual(['a', 'b'])
      expect(plan.tiers[1].map(p => p.name)).toEqual(['c'])
    })

    it('should build a chain of dependencies', () => {
      const plugins = [
        makePlugin('a', { produces: ['x'] }),
        makePlugin('b', { inject: ['x'], produces: ['y'] }),
        makePlugin('c', { inject: ['y'] }),
      ]

      const plan = buildExecutionPlan(plugins)

      expect(plan.tiers).toHaveLength(3)
      expect(plan.tiers[0][0].name).toBe('a')
      expect(plan.tiers[1][0].name).toBe('b')
      expect(plan.tiers[2][0].name).toBe('c')
    })

    it('should detect conflicts', () => {
      const plugins = [
        makePlugin('plugin-related', { produces: ['post.related'] }),
        makePlugin('plugin-related-v2', { produces: ['post.related'] }),
      ]

      expect(() => buildExecutionPlan(plugins)).toThrow(
        /plugin-related.*plugin-related-v2.*post\.related/,
      )
    })

    it('should detect cycles', () => {
      const plugins = [
        makePlugin('a', { inject: ['y'], produces: ['x'] }),
        makePlugin('b', { inject: ['x'], produces: ['y'] }),
      ]

      expect(() => buildExecutionPlan(plugins)).toThrow('cycle')
    })

    it('should ignore inject for non-existent keys', () => {
      const plugins = [
        makePlugin('a', { inject: ['builtinData'] }),
      ]

      const plan = buildExecutionPlan(plugins)
      expect(plan.tiers).toHaveLength(1)
    })

    it('should handle complex DAG', () => {
      // Diamond dependency: D depends on both B and C, which both depend on A
      const plugins = [
        makePlugin('a', { produces: ['x'] }),
        makePlugin('b', { inject: ['x'], produces: ['y'] }),
        makePlugin('c', { inject: ['x'], produces: ['z'] }),
        makePlugin('d', { inject: ['y', 'z'] }),
      ]

      const plan = buildExecutionPlan(plugins)

      expect(plan.tiers).toHaveLength(3)
      expect(plan.tiers[0][0].name).toBe('a')
      expect(plan.tiers[1].map(p => p.name).sort()).toEqual(['b', 'c'])
      expect(plan.tiers[2][0].name).toBe('d')
    })
  })

  describe('executePluginPlan', () => {
    it('should execute plugins in tier order', async () => {
      const order: string[] = []
      const plugins = [
        makePlugin('a', { produces: ['x'] }),
        makePlugin('b', { inject: ['x'], produces: ['y'] }),
        makePlugin('c', { inject: ['y'] }),
      ]

      const plan = buildExecutionPlan(plugins)

      await executePluginPlan(plan, async (plugin) => {
        order.push(plugin.name)
      })

      expect(order).toEqual(['a', 'b', 'c'])
    })

    it('should execute same-tier plugins in parallel', async () => {
      const startTimes: Record<string, number> = {}
      const plugins = [
        makePlugin('a', { produces: ['x'] }),
        makePlugin('b', { produces: ['y'] }),
      ]

      const plan = buildExecutionPlan(plugins)

      await executePluginPlan(plan, async (plugin) => {
        startTimes[plugin.name] = Date.now()
        // Simulate work
        await new Promise(r => setTimeout(r, 10))
      })

      // Both should start at roughly the same time (within 5ms)
      const diff = Math.abs(startTimes['a'] - startTimes['b'])
      expect(diff).toBeLessThan(10)
    })
  })
})
