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
import { loadConfig, Engine, loadTheme, DESIGN_TOKENS, extractAssignedTokens, buildStyles } from '@titan/core'

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
  .option('--root <dir>', 'Project root directory', { default: '.' })
  .action(async (options: { port: number; host?: string | boolean; root: string }) => {
    const rootDir = resolveRoot(options.root)

    console.log(pc.cyan('⚡ Titan') + ' Starting dev server...\n')

    try {
      const config = await loadConfig(rootDir)
      const engine = new Engine({ rootDir, config })
      const result = await engine.build()

      const { createServer } = await import('node:http')
      const { readFile } = await import('node:fs/promises')
      const { join, extname } = await import('node:path')

      const MIME_TYPES: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      }

      const server = createServer(async (req, res) => {
        let urlPath = req.url || '/'
        urlPath = urlPath.split('?')[0]
        try { urlPath = decodeURIComponent(urlPath) } catch { /* malformed URI — keep as-is */ }
        if (urlPath.endsWith('/')) urlPath += 'index.html'
        if (!extname(urlPath)) urlPath += '/index.html'

        const filePath = join(result.outDir, urlPath)
        try {
          const content = await readFile(filePath)
          const ext = extname(filePath)
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
          res.end(content)
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/html' })
          res.end('<h1>404 Not Found</h1>')
        }
      })

      const host = options.host === true ? '0.0.0.0' : (typeof options.host === 'string' ? options.host : 'localhost')
      const port = Number(options.port)

      server.listen(port, host, () => {
        console.log(
          pc.green('✓') +
          ` Dev server running at ` +
          pc.cyan(`http://${host}:${port}/`)
        )
        console.log(pc.dim(`  ${result.entries} entries, ${result.routes} routes`))
        console.log(pc.dim('\n  Press Ctrl+C to stop\n'))
      })
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

      const timings: { label: string; elapsed: number }[] = []
      const mark = (label: string, fn: () => Promise<void>) => async () => {
        const start = performance.now()
        await fn()
        timings.push({ label, elapsed: Math.round(performance.now() - start) })
      }

      // Run a full build, measuring each phase
      const totalStart = performance.now()

      const engine = new Engine({
        rootDir,
        config,
        noCache: true,
      })

      const result = await engine.build()
      const totalElapsed = Math.round(performance.now() - totalStart)

      // Engine.build() already measures total elapsed
      console.log(`  ${pc.bold('Total build time:')} ${pc.yellow(result.elapsed + 'ms')}`)
      console.log(`  ${pc.dim(`${result.entries} entries, ${result.routes} routes`)}`)
      console.log(`  ${pc.dim(`Output: ${result.outDir}`)}\n`)

      // Provide advice based on results
      if (result.elapsed > 5000) {
        console.log(pc.yellow('  Tip: Build took >5s. Consider using incremental builds (remove --no-cache).'))
      } else if (result.elapsed > 1000) {
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
