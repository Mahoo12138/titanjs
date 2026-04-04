/**
 * IoC Container + DAG Scheduling
 *
 * Analyzes plugin dependency declarations (inject/produces)
 * to build a directed acyclic graph and execute plugins
 * in correct order with maximum parallelism.
 */
import type { PluginDefinition } from '@titan/types'

export interface PluginNode {
  plugin: PluginDefinition
  /** Data keys this plugin produces */
  produces: Set<string>
  /** Data keys this plugin depends on */
  inject: Set<string>
  /** Indices of plugins that must run before this one */
  dependencies: Set<number>
}

export interface ExecutionPlan {
  /** Execution tiers: plugins in same tier can run in parallel */
  tiers: PluginDefinition[][]
  /** Dependency graph (for debugging) */
  graph: PluginNode[]
}

/**
 * Build an execution plan from plugin definitions
 *
 * Detects conflicts (multiple plugins producing the same key)
 * and cycles, then groups plugins into tiers for parallel execution.
 */
export function buildExecutionPlan(plugins: PluginDefinition[]): ExecutionPlan {
  // Build nodes
  const nodes: PluginNode[] = plugins.map((plugin) => ({
    plugin,
    produces: new Set(plugin.produces ?? []),
    inject: new Set(plugin.inject ?? []),
    dependencies: new Set<number>(),
  }))

  // Detect conflicts: two plugins producing the same key
  detectConflicts(nodes)

  // Build a map from produced key to producer index
  const producerMap = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) {
    for (const key of nodes[i].produces) {
      producerMap.set(key, i)
    }
  }

  // Resolve dependencies
  for (let i = 0; i < nodes.length; i++) {
    for (const key of nodes[i].inject) {
      const producerIdx = producerMap.get(key)
      if (producerIdx !== undefined && producerIdx !== i) {
        nodes[i].dependencies.add(producerIdx)
      }
      // Skip silently if no producer found — may be a built-in data key
    }
  }

  // Validate: warn about unresolved inject dependencies
  validateInjections(nodes, producerMap)

  // Detect cycles
  detectCycles(nodes)

  // Topological sort into tiers
  const tiers = topologicalTiers(nodes)

  return { tiers, graph: nodes }
}

/**
 * Validate that all injected keys have a known producer.
 * Built-in keys (like 'post.html') are allowed without a producer.
 * Unresolved keys produce a warning so plugin authors can fix their declarations.
 */
function validateInjections(
  nodes: PluginNode[],
  producerMap: Map<string, number>,
): void {
  // Built-in data keys that don't need a plugin producer
  const builtinKeys = new Set([
    'post.html', 'post.frontmatter', 'post.content',
    'page.html', 'page.frontmatter', 'page.content',
    'entry.html', 'entry.frontmatter', 'entry.content',
  ])

  for (const node of nodes) {
    for (const key of node.inject) {
      if (!producerMap.has(key) && !builtinKeys.has(key)) {
        console.warn(
          `[ioc] Plugin "${node.plugin.name}" injects "${key}" but no plugin produces it. ` +
          `Ensure a plugin declares produces: ['${key}'] or remove the injection.`,
        )
      }
    }
  }
}

/**
 * Detect two plugins producing the same key
 */
function detectConflicts(nodes: PluginNode[]): void {
  const seen = new Map<string, string>() // key → plugin name

  for (const node of nodes) {
    for (const key of node.produces) {
      const existing = seen.get(key)
      if (existing) {
        throw new Error(
          `Plugin conflict: "${existing}" and "${node.plugin.name}" both produce "${key}". Remove one of them.`,
        )
      }
      seen.set(key, node.plugin.name)
    }
  }
}

/**
 * Detect cycles using DFS
 */
function detectCycles(nodes: PluginNode[]): void {
  const UNVISITED = 0
  const IN_STACK = 1
  const DONE = 2
  const state = new Array(nodes.length).fill(UNVISITED)
  const path: number[] = []

  function dfs(i: number): void {
    if (state[i] === DONE) return
    if (state[i] === IN_STACK) {
      const cycleStart = path.indexOf(i)
      const cycle = path.slice(cycleStart).map((idx) => nodes[idx].plugin.name)
      cycle.push(nodes[i].plugin.name)
      throw new Error(
        `Plugin dependency cycle detected: ${cycle.join(' → ')}`,
      )
    }

    state[i] = IN_STACK
    path.push(i)

    for (const dep of nodes[i].dependencies) {
      dfs(dep)
    }

    path.pop()
    state[i] = DONE
  }

  for (let i = 0; i < nodes.length; i++) {
    dfs(i)
  }
}

/**
 * Group plugins into tiers using Kahn's algorithm
 * Plugins in the same tier have no dependencies on each other
 * and can run in parallel.
 */
function topologicalTiers(nodes: PluginNode[]): PluginDefinition[][] {
  const inDegree = new Array(nodes.length).fill(0)

  // Build adjacency list and in-degree counts
  const dependents = new Map<number, number[]>() // producer → consumers
  for (let i = 0; i < nodes.length; i++) {
    for (const dep of nodes[i].dependencies) {
      inDegree[i]++
      if (!dependents.has(dep)) dependents.set(dep, [])
      dependents.get(dep)!.push(i)
    }
  }

  // Start with nodes that have no dependencies
  let queue: number[] = []
  for (let i = 0; i < nodes.length; i++) {
    if (inDegree[i] === 0) queue.push(i)
  }

  const tiers: PluginDefinition[][] = []

  while (queue.length > 0) {
    // All nodes in current queue form one tier
    tiers.push(queue.map((i) => nodes[i].plugin))

    const nextQueue: number[] = []
    for (const i of queue) {
      for (const dep of dependents.get(i) ?? []) {
        inDegree[dep]--
        if (inDegree[dep] === 0) {
          nextQueue.push(dep)
        }
      }
    }

    queue = nextQueue
  }

  return tiers
}

/**
 * Execute plugins according to the execution plan
 * Plugins in the same tier run in parallel
 */
export async function executePluginPlan(
  plan: ExecutionPlan,
  executor: (plugin: PluginDefinition) => Promise<void>,
): Promise<void> {
  for (const tier of plan.tiers) {
    await Promise.all(tier.map(executor))
  }
}
