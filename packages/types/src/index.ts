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

export type {
  CollectionDefinition,
  CollectionRoutes,
  LocaleStrategy,
} from './collection.js'
export { defineCollection } from './collection.js'

export type {
  SingletonDefinition,
} from './singleton.js'
export { defineSingleton } from './singleton.js'

export type {
  ThemeDefinition,
  SlotDefinition,
  SlotComponentDefinition,
  IslandDefinition,
  ResolvedTheme,
  LayoutModule,
  SiteContext,
  PageContext,
  PostContext,
  PageLayoutContext,
  ListContext,
  CollectionItemContext,
} from './theme.js'
export { defineTheme, defineSlot, defineSlotComponent } from './theme.js'
