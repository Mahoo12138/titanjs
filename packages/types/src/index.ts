// @titan/types - Shared type definitions for Titan SSG

// JSX custom-element support (catch-all for arbitrary HTML element names in JSX)
import './jsx-custom-elements.js'

// Error types
export {
  TitanError,
  ConfigError,
  PluginError,
  ThemeError,
  BuildError,
  ValidationError,
} from './errors.js'

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
  EntryExtensions,
} from './content.js'

export { setEntryData, getEntryData } from './content.js'

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
  PluginSetupContext,
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
  WidgetDefinition,
  WidgetContext,
  WidgetSiteContext,
  WidgetDataLoaderContext,
  SidebarConfig,
  LayoutSidebarConfig,
  SiteTree,
  WidgetsConfig,
  WidgetMap,
  WidgetRegistry,
} from './widget.js'
export { defineWidget } from './widget.js'

export type {
  ThemeDefinition,
  SlotDefinition,
  SlotComponentDefinition,
  IslandDefinition,
  ResolvedTheme,
  ResolvedStyleOutput,
  LayoutModule,
  LayoutProps,
  SiteContext,
  PageContext,
  PostContext,
  PageLayoutContext,
  ListContext,
  CollectionItemContext,
} from './theme.js'
export { defineTheme, defineSlot, defineSlotComponent } from './theme.js'
