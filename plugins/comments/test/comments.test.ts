import { describe, it, expect } from 'vitest'
import { pluginComments } from '../src/plugin.js'

describe('pluginComments', () => {
  it('should return a PluginDefinition with correct name', () => {
    const plugin = pluginComments({
      provider: 'giscus',
      giscus: {
        repo: 'user/repo',
        repoId: 'R_xxx',
        category: 'General',
        categoryId: 'DIC_xxx',
      },
    })
    expect(plugin.name).toBe('@titan/plugin-comments')
  })

  it('should register a slot component for post:after-content', () => {
    const plugin = pluginComments({
      provider: 'giscus',
      giscus: {
        repo: 'user/repo',
        repoId: 'R_xxx',
        category: 'General',
        categoryId: 'DIC_xxx',
      },
    })
    expect(plugin.slotComponents).toBeDefined()
    expect(plugin.slotComponents!.length).toBe(1)
    expect(plugin.slotComponents![0].slot).toBe('post:after-content')
  })

  it('should allow custom slot target', () => {
    const plugin = pluginComments({
      provider: 'giscus',
      giscus: {
        repo: 'user/repo',
        repoId: 'R_xxx',
        category: 'General',
        categoryId: 'DIC_xxx',
      },
      slot: 'footer:extra',
    })
    expect(plugin.slotComponents![0].slot).toBe('footer:extra')
  })

  it('should set island activation to client:visible', () => {
    const plugin = pluginComments({
      provider: 'giscus',
      giscus: {
        repo: 'user/repo',
        repoId: 'R_xxx',
        category: 'General',
        categoryId: 'DIC_xxx',
      },
    })
    expect(plugin.slotComponents![0].island).toBeDefined()
    expect(plugin.slotComponents![0].island!.activate).toBe('client:visible')
  })

  it('should set high order number for end-of-content placement', () => {
    const plugin = pluginComments({
      provider: 'giscus',
      giscus: {
        repo: 'user/repo',
        repoId: 'R_xxx',
        category: 'General',
        categoryId: 'DIC_xxx',
      },
    })
    expect(plugin.slotComponents![0].order).toBeGreaterThanOrEqual(900)
  })

  describe('providers', () => {
    it('should support Giscus', () => {
      const plugin = pluginComments({
        provider: 'giscus',
        giscus: {
          repo: 'user/repo',
          repoId: 'R_xxx',
          category: 'General',
          categoryId: 'DIC_xxx',
        },
      })
      expect(plugin.slotComponents![0].component).toBeDefined()
    })

    it('should support Waline', () => {
      const plugin = pluginComments({
        provider: 'waline',
        waline: { serverURL: 'https://waline.example.com' },
      })
      expect(plugin.slotComponents![0].component).toBeDefined()
    })

    it('should support Twikoo', () => {
      const plugin = pluginComments({
        provider: 'twikoo',
        twikoo: { envId: 'https://twikoo.example.com' },
      })
      expect(plugin.slotComponents![0].component).toBeDefined()
    })
  })

  describe('SSR rendering', () => {
    it('should render Giscus component as VNode', () => {
      const plugin = pluginComments({
        provider: 'giscus',
        giscus: {
          repo: 'user/repo',
          repoId: 'R_xxx',
          category: 'General',
          categoryId: 'DIC_xxx',
          mapping: 'title',
          theme: 'dark',
        },
      })
      const component = plugin.slotComponents![0].component
      const vnode = component({ post: { url: '/test/' } })
      expect(vnode).toBeDefined()
      // Verify it's a valid Preact VNode
      expect(vnode.type).toBeDefined()
    })

    it('should render Waline component as VNode', () => {
      const plugin = pluginComments({
        provider: 'waline',
        waline: { serverURL: 'https://waline.example.com', lang: 'en' },
      })
      const component = plugin.slotComponents![0].component
      const vnode = component({ post: { url: '/test/' } })
      expect(vnode).toBeDefined()
      expect(vnode.type).toBeDefined()
    })

    it('should render Twikoo component as VNode', () => {
      const plugin = pluginComments({
        provider: 'twikoo',
        twikoo: { envId: 'abc123', region: 'ap-shanghai' },
      })
      const component = plugin.slotComponents![0].component
      const vnode = component({ post: { url: '/test/' } })
      expect(vnode).toBeDefined()
      expect(vnode.type).toBeDefined()
    })
  })
})
