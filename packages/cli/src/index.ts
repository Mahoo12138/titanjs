/**
 * @titan/cli - Command line interface for Titan SSG
 *
 * Commands:
 *   titan dev            Start dev server with HMR
 *   titan build          Production build
 *   titan build --no-cache  Build without cache
 *   titan clean          Clear cache and output
 *   titan info           Print environment info
 */
import path from 'node:path'
import { cac } from 'cac'
import pc from 'picocolors'
import { loadConfig, Engine, DevSession, loadTheme, DESIGN_TOKENS, extractAssignedTokens } from '@titan/core'
import { titanVitePlugin } from '@titan/vite-plugin'

const cli = cac('titan')

// ── titan build ──
cli
  .command('build', 'Build static site for production')
  .option('--no-cache', 'Skip cache, full rebuild')
  .option('--root <dir>', 'Project root directory', { default: '.' })
  .action(async (options: { cache: boolean; root: string }) => {
    const rootDir = resolveRoot(options.root)

    console.log(pc.cyan('⚡ Titan') + ' Building...\n')

    try {
      const config = await loadConfig(rootDir)
      const engine = new Engine({
        rootDir,
        config,
        noCache: !options.cache,
      })

      const result = await engine.build()

      console.log(
        pc.green('✓') +
        ` Build complete: ${result.entries} entries, ${result.routes} routes` +
        pc.dim(` (${result.elapsed}ms)`)
      )
      console.log(pc.dim(`  Output: ${result.outDir}`))
    } catch (err) {
      printError(err)
      process.exit(1)
    }
  })

// ── titan dev ──
cli
  .command('dev', 'Start development server')
  .option('--port <port>', 'Dev server port', { default: 4000 })
  .option('--host [host]', 'Dev server host')
  .option('--debug', 'Enable dev diagnostics')
  .option('--root <dir>', 'Project root directory', { default: '.' })
  .action(async (options: { port: number; host?: string | boolean; debug?: boolean; root: string }) => {
    const rootDir = resolveRoot(options.root)

    console.log(pc.cyan('⚡ Titan') + ' Starting dev server...\n')

    try {
      const config = await loadConfig(rootDir)

      // Create DevSession (lightweight index, no full HTML emit)
      const session = new DevSession({
        rootDir,
        config,
        debug: Boolean(options.debug),
      })
      const initResult = await session.init()

      console.log(
        pc.green('✓') +
        ` Index ready: ${initResult.entries} entries, ${initResult.routes} routes` +
        pc.dim(` (${initResult.elapsed}ms)`)
      )

      // Create Vite dev server with Titan plugin
      const { createServer } = await import('vite')

      const host = options.host === true ? '0.0.0.0' : (typeof options.host === 'string' ? options.host : 'localhost')
      const port = Number(options.port)

      const viteServer = await createServer({
        root: rootDir,
        server: {
          host,
          port,
          strictPort: false,
        },
        plugins: [
          titanVitePlugin({
            rootDir,
            config,
            devSession: session,
            onFileChange(filePath, result) {
              const relPath = path.relative(rootDir, filePath)
              const changeType = result.frontmatterChanged ? 'frontmatter' : 'body'
              const cacheRate = Math.round(session.cacheHitRate * 100)
              if (result.entryId) {
                console.log(
                  pc.dim(`  [hmr]`) +
                  ` ${relPath}` +
                  pc.dim(` (${changeType})`) +
                  pc.dim(` → ${result.affectedRoutes.length} route(s)`) +
                  pc.dim(` (${result.elapsed}ms, cache ${cacheRate}%)`)
                )
              } else {
                console.log(
                  pc.dim(`  [hmr]`) +
                  pc.yellow(` full re-index`) +
                  pc.dim(` (${result.elapsed}ms, cache ${cacheRate}%)`)
                )
              }

              if (options.debug && result.affectedRoutes.length > 0) {
                const preview = result.affectedRoutes.slice(0, 5).join(', ')
                const suffix = result.affectedRoutes.length > 5 ? ', ...' : ''
                console.log(pc.dim(`        ${preview}${suffix}`))
              }
            },
          }),
        ],
        // Suppress Vite's default HTML handling
        appType: 'custom',
        logLevel: 'warn',
      })

      await viteServer.listen()

      console.log(
        pc.green('✓') +
        ` Dev server running at ` +
        pc.cyan(`http://${host}:${port}/`)
      )
      console.log(pc.dim('  Pages are compiled on first visit'))
      console.log(pc.dim('  Markdown changes trigger precise HMR'))
      if (options.debug) {
        console.log(pc.dim('  Dev diagnostics enabled'))
      }
      console.log(pc.dim('\n  Press Ctrl+C to stop\n'))
    } catch (err) {
      printError(err)
      process.exit(1)
    }
  })

// ── titan clean ──
cli
  .command('clean', 'Clear cache and output directories')
  .option('--root <dir>', 'Project root directory', { default: '.' })
  .action(async (options: { root: string }) => {
    const rootDir = resolveRoot(options.root)

    try {
      const config = await loadConfig(rootDir)
      const engine = new Engine({ rootDir, config })
      await engine.clean()
      console.log(pc.green('✓') + ' Cache and output cleared')
    } catch (err) {
      printError(err)
      process.exit(1)
    }
  })

// ── titan info ──
cli
  .command('info', 'Print environment info')
  .option('--root <dir>', 'Project root directory', { default: '.' })
  .option('--slots', 'Show slot registration details')
  .option('--tokens', 'Show design token assignments')
  .action(async (options: { root: string; slots?: boolean; tokens?: boolean }) => {
    const rootDir = resolveRoot(options.root)

    try {
      const config = await loadConfig(rootDir)

      // ── Slot inspection ──
      if (options.slots) {
        console.log(pc.cyan('⚡ Titan') + ' Slot Registration\n')

        const theme = await loadTheme(
          config.theme,
          rootDir,
          config.plugins,
        )

        if (!theme) {
          console.log(pc.dim('  No theme configured – no slots available.\n'))
          return
        }

        const declaredSlots = theme.definition.slots ?? {}
        const slotNames = Object.keys(declaredSlots)

        if (slotNames.length === 0) {
          console.log(pc.dim('  Theme declares no slots.\n'))
          return
        }

        for (const name of slotNames) {
          const def = declaredSlots[name]
          const components = theme.slotComponents.get(name) ?? []
          const mode = def.mode ?? 'stack'

          console.log(`  ${pc.bold(name)} ${pc.dim(`(${mode})`)}`)
          if (def.description) {
            console.log(`    ${pc.dim(def.description)}`)
          }

          if (components.length > 0) {
            for (const comp of components) {
              console.log(`    ${pc.green('→')} ${comp.slot} ${pc.dim(`order: ${comp.order ?? 0}`)}`)
            }
          } else {
            console.log(`    ${pc.dim('(no injections)')}`)
          }
          console.log()
        }

        return
      }

      // ── Token inspection ──
      if (options.tokens) {
        console.log(pc.cyan('⚡ Titan') + ' Design Token Assignments\n')

        const theme = await loadTheme(
          config.theme,
          rootDir,
          config.plugins,
        )

        // Gather assigned tokens from theme CSS
        const themeCSS = theme?.styles ?? ''
        const assigned = extractAssignedTokens(themeCSS)

        // User overrides
        const userOverrides = config.styles?.tokens ?? {}

        console.log(`  ${pc.bold('All tokens')} (${DESIGN_TOKENS.length} total):\n`)

        for (const token of DESIGN_TOKENS) {
          const fromTheme = assigned.has(token)
          const fromUser = token in userOverrides

          let source: string
          if (fromUser) {
            source = pc.yellow('user override') + pc.dim(` → ${userOverrides[token]}`)
          } else if (fromTheme) {
            source = pc.green('theme')
          } else {
            source = pc.red('unset')
          }

          console.log(`  ${token.padEnd(28)} ${source}`)
        }

        console.log()
        return
      }

      // ── Default info ──

      console.log(pc.cyan('⚡ Titan') + ' Environment Info\n')
      console.log(`  Node.js:    ${process.version}`)
      console.log(`  Platform:   ${process.platform} ${process.arch}`)
      console.log(`  Root:       ${rootDir}`)
      console.log(`  Source:     ${config.source}`)
      console.log(`  Output:     ${config.build.outDir}`)
      console.log(`  Cache:      ${config.build.cacheDir}`)
      console.log(`  Plugins:    ${config.plugins.length > 0 ? config.plugins.map(p => p.name).join(', ') : '(none)'}`)
      console.log(`  Theme:      ${config.theme ?? '(built-in)'}`)
    } catch (err) {
      printError(err)
      process.exit(1)
    }
  })

// ── titan profile ──
cli
  .command('profile', 'Profile build performance')
  .option('--root <dir>', 'Project root directory', { default: '.' })
  .action(async (options: { root: string }) => {
    const rootDir = resolveRoot(options.root)

    console.log(pc.cyan('⚡ Titan') + ' Build Profile\n')

    try {
      const config = await loadConfig(rootDir)

      const engine = new Engine({
        rootDir,
        config,
        noCache: true,
      })

      // Measure each phase independently using decomposed sub-methods
      const timings: { label: string; elapsed: number }[] = []
      const totalStart = performance.now()

      let start = performance.now()
      await engine.init()
      timings.push({ label: 'Init (plugins, hooks, processor)', elapsed: Math.round(performance.now() - start) })

      start = performance.now()
      const { loadContexts, singletonData } = await engine.loadAll()
      timings.push({ label: `Load (${loadContexts.length} files)`, elapsed: Math.round(performance.now() - start) })

      start = performance.now()
      const { entries } = await engine.transformAll(loadContexts)
      timings.push({ label: `Transform (${entries.length} entries)`, elapsed: Math.round(performance.now() - start) })

      start = performance.now()
      const { generateCtx } = await engine.generate(entries, singletonData)
      timings.push({ label: `Generate (${generateCtx.routes.length} routes)`, elapsed: Math.round(performance.now() - start) })

      start = performance.now()
      const { theme } = await engine.resolveTheme()
      timings.push({ label: 'Theme resolve', elapsed: Math.round(performance.now() - start) })

      start = performance.now()
      await engine.emit(generateCtx, theme)
      timings.push({ label: 'Emit (HTML write)', elapsed: Math.round(performance.now() - start) })

      const totalElapsed = Math.round(performance.now() - totalStart)
      const outDir = path.join(rootDir, config.build.outDir)

      // Print per-phase breakdown
      console.log(`  ${pc.bold('Phase breakdown:')}`)
      for (const t of timings) {
        const bar = '█'.repeat(Math.max(1, Math.round(t.elapsed / totalElapsed * 20)))
        console.log(`  ${pc.dim(bar)} ${t.label} ${pc.yellow(t.elapsed + 'ms')}`)
      }

      console.log()
      console.log(`  ${pc.bold('Total:')} ${pc.yellow(totalElapsed + 'ms')}`)
      console.log(`  ${pc.dim(`${entries.length} entries, ${generateCtx.routes.length} routes`)}`)
      console.log(`  ${pc.dim(`Output: ${outDir}`)}\n`)

      // Provide advice based on results
      if (totalElapsed > 5000) {
        console.log(pc.yellow('  Tip: Build took >5s. Consider using incremental builds (remove --no-cache).'))
      } else if (totalElapsed > 1000) {
        console.log(pc.dim('  Build time is reasonable.'))
      } else {
        console.log(pc.green('  ✓') + ' Fast build!')
      }

      console.log()
    } catch (err) {
      printError(err)
      process.exit(1)
    }
  })

// ── Helpers ──

function resolveRoot(root: string): string {
  return path.resolve(process.cwd(), root)
}

function printError(err: unknown): void {
  if (err instanceof Error) {
    console.error(pc.red('✗ ') + err.message)
    if (err.stack) {
      console.error(pc.dim(err.stack.split('\n').slice(1).join('\n')))
    }
  } else {
    console.error(pc.red('✗ ') + String(err))
  }
}

// Parse CLI arguments
cli.help()
cli.version('0.0.1')
cli.parse()
