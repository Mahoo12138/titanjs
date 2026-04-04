/**
 * Structured error types for TitanJS
 *
 * Provides a typed error hierarchy for programmatic error handling.
 */

export class TitanError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TitanError'
    this.code = code
  }
}

export class ConfigError extends TitanError {
  constructor(message: string, options?: ErrorOptions) {
    super('CONFIG_ERROR', message, options)
    this.name = 'ConfigError'
  }
}

export class PluginError extends TitanError {
  readonly pluginName: string
  readonly hookName?: string

  constructor(pluginName: string, message: string, options?: ErrorOptions & { hookName?: string }) {
    super('PLUGIN_ERROR', message, options)
    this.name = 'PluginError'
    this.pluginName = pluginName
    this.hookName = options?.hookName
  }
}

export class ThemeError extends TitanError {
  readonly themeName?: string

  constructor(message: string, options?: ErrorOptions & { themeName?: string }) {
    super('THEME_ERROR', message, options)
    this.name = 'ThemeError'
    this.themeName = options?.themeName
  }
}

export class BuildError extends TitanError {
  readonly stage?: string

  constructor(message: string, options?: ErrorOptions & { stage?: string }) {
    super('BUILD_ERROR', message, options)
    this.name = 'BuildError'
    this.stage = options?.stage
  }
}

export class ValidationError extends TitanError {
  readonly field?: string

  constructor(message: string, options?: ErrorOptions & { field?: string }) {
    super('VALIDATION_ERROR', message, options)
    this.name = 'ValidationError'
    this.field = options?.field
  }
}
