import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import path from 'node:path'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)

const testDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(testDir, '../../..')
const exampleDir = path.join(repoRoot, 'example')
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js')

describe('CLI integration', () => {
  let devServer: ChildProcessWithoutNullStreams | null = null

  beforeAll(async () => {
    await execFileAsync(
      'pnpm',
      ['-r', '--filter', '@titan/core', '--filter', '@titan/vite-plugin', '--filter', '@titan/cli', 'build'],
      { cwd: repoRoot },
    )
  }, 120000)

  afterAll(async () => {
    if (devServer && !devServer.killed) {
      devServer.kill('SIGTERM')
      await onceProcessExit(devServer)
    }
  })

  it('prints a per-phase build profile', async () => {
    const { stdout } = await execFileAsync(
      'node',
      [cliEntry, 'profile', '--root', exampleDir],
      { cwd: repoRoot },
    )

    expect(stdout).toContain('Phase breakdown:')
    expect(stdout).toContain('Init (plugins, hooks, processor)')
    expect(stdout).toContain('Transform (14 entries)')
    expect(stdout).toContain('Emit (HTML write)')
    expect(stdout).toContain('Total:')
  }, 120000)

  it('serves on-demand HTML in dev mode', async () => {
    const port = 4011
    devServer = spawn(
      'node',
      [cliEntry, 'dev', '--root', exampleDir, '--port', String(port)],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
    )

    await waitForOutput(devServer, 'Dev server running at')

    const indexResponse = await fetch(`http://127.0.0.1:${port}/`)
    const indexHtml = await indexResponse.text()
    expect(indexResponse.status).toBe(200)
    expect(indexHtml).toContain('/@vite/client')

    const postResponse = await fetch(`http://127.0.0.1:${port}/posts/hello-world/`)
    const postHtml = await postResponse.text()
    expect(postResponse.status).toBe(200)
    expect(postHtml).toContain('Hello World')
    expect(postHtml).toContain('/@vite/client')

    devServer.kill('SIGTERM')
    await onceProcessExit(devServer)
    devServer = null
  }, 120000)
})

function onceProcessExit(process: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    process.once('exit', () => resolve())
  })
}

function waitForOutput(
  process: ChildProcessWithoutNullStreams,
  marker: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.includes(marker)) {
        cleanup()
        resolve()
      }
    }

    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString()
    }

    const onExit = (code: number | null) => {
      cleanup()
      reject(new Error(`process exited before readiness marker (${code}): ${stderr || stdout}`))
    }

    const cleanup = () => {
      process.stdout.off('data', onStdout)
      process.stderr.off('data', onStderr)
      process.off('exit', onExit)
    }

    process.stdout.on('data', onStdout)
    process.stderr.on('data', onStderr)
    process.once('exit', onExit)
  })
}