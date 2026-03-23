// @titan/types - Shared type definitions for Titan SSG

export type {
  Middleware,
  Pipeline,
  LoadContext,
  TransformContext,
  GenerateContext,
  EmitContext,
} from './pipeline.js'

export type {
  BaseEntry,
  Post,
  Page,
  AssetRef,
  ResolvedAsset,
  Heading,
  Tag,
  Category,
  AlternateLink,
  Collection,
  SiteData,
} from './content.js'

export type {
  Route,
  Pagination,
} from './route.js'

export type {
  TitanConfig,
  BuildConfig,
  MarkdownConfig,
  StyleConfig,
  ThemeReference,
  PluginDefinition,
  PluginHooks,
  UserConfig,
} from './config.js'
