/**
 * Tree Widget — Wiki document tree sidebar
 *
 * Shows the section/page tree for the current wiki project.
 */
import { z } from 'zod'

export const treeWidget = {
  name: 'tree',

  configSchema: z.object({
    title: z.string().default(''),
  }),

  dataLoader: function treeDataLoader(ctx: any) {
    const entry = ctx.entry
    if (!entry) return null

    const projectId = entry.frontmatter?.wiki
    if (!projectId) return null

    const wikiTree = ctx.siteData?.wikiTree
    if (!wikiTree) return null

    const project = wikiTree.projects?.[projectId]
    if (!project) return null

    return {
      project,
      currentSlug: entry.slug,
    }
  },

  component: function TreeWidget(ctx: any) {
    const { data } = ctx
    if (!data || !data.project) return null

    const { project, currentSlug } = data

    return (
      <widget class="widget-wrapper doc-tree">
        <div class="widget-header">
          <a class="name" href={project.homepage || '#'}>{project.title}</a>
        </div>
        <div class="widget-body">
          <nav class="doc-tree-nav">
            {project.sections.map((section: any, i: number) => (
              <div key={i} class="doc-section">
                {section.title && (
                  <div class="doc-section-title">{section.title}</div>
                )}
                <ul class="doc-page-list">
                  {section.pages.map((page: any) => (
                    <li
                      key={page.slug}
                      class={`doc-page-item${page.slug === currentSlug ? ' active' : ''}`}
                    >
                      <a href={page.url}>{page.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </widget>
    )
  },
}
