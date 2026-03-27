/**
 * Default theme configuration
 *
 * Demonstrates TitanJS theme system:
 * - Layout resolution by content type
 * - Slot declarations for plugin extensibility
 * - View Transitions support
 */
export default {
  name: 'titan-default',
  version: '1.0.0',

  // Map content types to layout names
  typeLayoutMap: {
    post: 'post',
    page: 'page',
  },

  // Declared slots that plugins can target
  slots: {
    'head:extra': {
      description: 'Extra tags injected into <head>',
      mode: 'stack',
    },
    'post:before-content': {
      description: 'Before the post body content',
      mode: 'stack',
    },
    'post:after-content': {
      description: 'After the post body content (comments, related posts, etc.)',
      mode: 'stack',
    },
    'sidebar': {
      description: 'Sidebar widgets',
      mode: 'stack',
    },
    'footer': {
      description: 'Footer content',
      mode: 'replace',
    },
  },

  viewTransitions: true,
}
