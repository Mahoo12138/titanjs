/**
 * TagTree Widget — Hierarchical tag tree sidebar for notebooks
 *
 * Shows the tag tree for the current notebook.
 */
import { h } from 'preact'
import { z } from 'zod'

function renderNode(tagTree: any, nodeId: string, depth: number, activeTag: string): any {
  const node = tagTree instanceof Map ? tagTree.get(nodeId) : tagTree[nodeId]
  if (!node) return null

  const isActive = nodeId === activeTag
  const isRoot = nodeId === ''
  const label = isRoot ? '全部笔记' : node.name
  const count = node.notes?.length ?? 0

  return (
    <div key={nodeId} class={`tagtree-node depth-${depth}${isActive ? ' active' : ''}`}>
      <a
        class="tagtree-link"
        href={node.path}
        style={depth > 0 ? `padding-left: ${depth * 0.875}rem` : undefined}
      >
        <span class="tagtree-name">{label}</span>
        <span class="tagtree-count">{count}</span>
      </a>
      {node.children && node.children.length > 0 && (
        <div class="tagtree-children">
          {node.children.map((childId: string) => renderNode(tagTree, childId, depth + 1, activeTag))}
        </div>
      )}
    </div>
  )
}

export const tagtreeWidget = {
  name: 'tagtree',

  configSchema: z.object({
    expandAll: z.boolean().default(true),
    title: z.string().default('标签'),
  }),

  dataLoader: function tagtreeDataLoader(ctx: any) {
    const entry = ctx.entry
    if (!entry) return null

    const notebookId = entry.frontmatter?.notebook
    if (!notebookId) return null

    const notebooksTree = ctx.siteData?.notebooksTree
    if (!notebooksTree) return null

    const notebook = notebooksTree.notebooks?.[notebookId]
    if (!notebook) return null

    return {
      notebook,
      activeTag: ctx.route?.data?.activeTag ?? '',
    }
  },

  component: function TagTreeWidget(ctx: any) {
    const { config, data } = ctx
    if (!data || !data.notebook) return null

    const { notebook, activeTag } = data
    const { tagTree } = notebook

    return (
      <widget class="widget-wrapper tagtree-widget">
        <div class="widget-header">
          <span class="name">{config.title || '标签'}</span>
        </div>
        <div class="widget-body">
          <nav class="tagtree-nav">
            {renderNode(tagTree, '', 0, activeTag)}
          </nav>
        </div>
      </widget>
    )
  },
}
