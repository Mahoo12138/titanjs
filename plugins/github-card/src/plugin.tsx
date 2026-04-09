/**
 * GitHub Card Block — Sidebar Widget
 *
 * Renders a GitHub profile card showing username, avatar, bio,
 * and repo/follower/following stats. Uses the Block system to
 * register as a sidebar widget via siteTree.
 *
 * The block prefetches GitHub API data during the Generate stage
 * and renders as a Preact component during SSR.
 */
import { z } from 'zod'
import { defineBlock } from '@titan/types'
import type {
  PluginDefinition,
  BlockPrefetchContext,
  BlockRenderContext,
} from '@titan/types'
import { h } from 'preact'

// ── Config Type ──

export interface GithubCardConfig {
  username: string
  showRepos: boolean
  showFollowers: boolean
  showBio: boolean
  title: string
}

// ── Prefetched Data ──

interface GithubCardData {
  name: string | null
  avatar: string
  bio: string | null
  url: string
  repos: number
  followers: number
  following: number
}

// ── Prefetch handler ──

async function prefetchGithub(
  ctx: BlockPrefetchContext<GithubCardConfig>,
): Promise<GithubCardData> {
  const { config } = ctx

  try {
    const res = await fetch(
      `https://api.github.com/users/${encodeURIComponent(config.username)}`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(5000),
      },
    )
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)

    const json = (await res.json()) as Record<string, unknown>

    return {
      name: (json.name as string) ?? null,
      avatar: json.avatar_url as string,
      bio: (json.bio as string) ?? null,
      url: json.html_url as string,
      repos: json.public_repos as number,
      followers: json.followers as number,
      following: json.following as number,
    }
  } catch {
    // Offline / rate-limited — render with placeholder data
    return {
      name: config.username,
      avatar: `https://github.com/${encodeURIComponent(config.username)}.png`,
      bio: null,
      url: `https://github.com/${encodeURIComponent(config.username)}`,
      repos: 0,
      followers: 0,
      following: 0,
    }
  }
}

// ── Render handler ──

function renderGithubCard(
  ctx: BlockRenderContext<GithubCardConfig, GithubCardData>,
) {
  const { config, data } = ctx
  const displayName = data.name ?? config.username

  return h('widget', { class: 'widget-wrapper github-card' }, [
    h('div', { class: 'widget-header' }, [
      h('span', { class: 'name' }, config.title),
      h('a', { class: 'cap-action', href: data.url, target: '_blank', rel: 'noopener' }, '↗'),
    ]),
    h('div', { class: 'widget-body' }, [
      h('div', { class: 'github-card-profile' }, [
        h('img', {
          class: 'github-card-avatar',
          src: data.avatar,
          alt: displayName,
          width: 64,
          height: 64,
          loading: 'lazy',
        }),
        h('div', { class: 'github-card-info' }, [
          h('a', {
            class: 'github-card-name',
            href: data.url,
            target: '_blank',
            rel: 'noopener',
          }, displayName),
          config.showBio && data.bio
            ? h('p', { class: 'github-card-bio' }, data.bio)
            : null,
        ]),
      ]),

      config.showRepos || config.showFollowers
        ? h('div', { class: 'github-card-stats' }, [
            config.showRepos
              ? h('a', {
                  class: 'github-card-stat',
                  href: `${data.url}?tab=repositories`,
                  target: '_blank',
                  rel: 'noopener',
                }, [
                  h('span', { class: 'github-card-stat-value' }, String(data.repos)),
                  h('span', { class: 'github-card-stat-label' }, 'Repos'),
                ])
              : null,
            config.showFollowers
              ? h('a', {
                  class: 'github-card-stat',
                  href: `${data.url}?tab=followers`,
                  target: '_blank',
                  rel: 'noopener',
                }, [
                  h('span', { class: 'github-card-stat-value' }, String(data.followers)),
                  h('span', { class: 'github-card-stat-label' }, 'Followers'),
                ])
              : null,
            config.showFollowers
              ? h('a', {
                  class: 'github-card-stat',
                  href: `${data.url}?tab=following`,
                  target: '_blank',
                  rel: 'noopener',
                }, [
                  h('span', { class: 'github-card-stat-value' }, String(data.following)),
                  h('span', { class: 'github-card-stat-label' }, 'Following'),
                ])
              : null,
          ])
        : null,
    ]),
  ])
}

// ── Plugin Options ──

export interface GithubCardOptions {
  /** GitHub username to display */
  username: string
  /** Whether to show public repo count (default: true) */
  showRepos?: boolean
  /** Whether to show follower/following stats (default: true) */
  showFollowers?: boolean
  /** Whether to show bio text (default: true) */
  showBio?: boolean
  /** Custom widget title (default: 'GitHub') */
  title?: string
}

// ── Plugin Factory ──

/**
 * Creates a GitHub Card plugin that renders a profile widget in the sidebar.
 *
 * The user's theme siteTree must include `'github-card'` in a sidebar position
 * to display it. For example, in the theme config's `siteTree`:
 *
 * ```ts
 * siteTree: {
 *   home: { leftbar: ['author', 'github-card', 'recent'] },
 *   post: { leftbar: ['github-card', 'recent'] },
 * }
 * ```
 */
export function pluginGithubCard(options: GithubCardOptions): PluginDefinition {
  // Build config schema with user options baked in as Zod defaults,
  // so BlockRegistry.resolveConfig() produces correct values with empty input.
  const configSchema = z.object({
    username: z.string().default(options.username),
    showRepos: z.boolean().default(options.showRepos ?? true),
    showFollowers: z.boolean().default(options.showFollowers ?? true),
    showBio: z.boolean().default(options.showBio ?? true),
    title: z.string().default(options.title ?? 'GitHub'),
  }) as z.ZodType<GithubCardConfig>

  const block = defineBlock({
    name: 'github-card',
    configSchema,
    prefetch: prefetchGithub,
    render: renderGithubCard,
    order: 20,
  })

  return {
    name: '@titan/plugin-github-card',
    blocks: [block],
  }
}
