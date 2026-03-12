/**
 * @neo-hexo/server — Dev Server Plugin
 *
 * Provides a built-in development server with:
 * - Lightweight HTTP server (Node.js native `http`)
 * - WebSocket live reload (native `ws` via `node:http` upgrade)
 * - Error overlay pushed via WebSocket
 * - Lazy rendering (render on first request)
 * - 304 Not Modified (ETag-based)
 * - MIME type auto-detection
 * - File watching → incremental rebuild → auto reload
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as nodePath from 'node:path';
import type { Socket } from 'node:net';
import type {
  NeoHexoPlugin,
  Router,
  Context,
} from '@neo-hexo/core';
import {
  RouterServiceKey,
  CommandRegistryKey,
} from '@neo-hexo/core';

// ─── MIME Types ──────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.wasm': 'application/wasm',
};

/**
 * Get MIME type from file extension.
 */
export function getMimeType(filePath: string): string {
  const ext = nodePath.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// ─── ETag ────────────────────────────────────────────────────────────────────

/**
 * Compute a weak ETag from content.
 */
export function computeETag(content: string | Buffer): string {
  const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
  return `W/"${hash}"`;
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

/** WebSocket opcode constants. */
const WS_OPCODES = {
  TEXT: 0x01,
  CLOSE: 0x08,
  PING: 0x09,
  PONG: 0x0a,
} as const;

/**
 * Minimal WebSocket connection handler.
 * Implements RFC 6455 enough for text frames, ping/pong, and close.
 */
export class WebSocketConnection {
  private socket: Socket;
  private alive = true;

  constructor(socket: Socket) {
    this.socket = socket;
    this.socket.on('data', (data) => this.handleFrame(data));
    this.socket.on('close', () => { this.alive = false; });
    this.socket.on('error', () => { this.alive = false; });
  }

  get isAlive(): boolean {
    return this.alive && !this.socket.destroyed;
  }

  /**
   * Send a text message.
   */
  send(message: string): void {
    if (!this.isAlive) return;
    const payload = Buffer.from(message, 'utf-8');
    this.sendFrame(WS_OPCODES.TEXT, payload);
  }

  /**
   * Send a ping frame.
   */
  ping(): void {
    if (!this.isAlive) return;
    this.sendFrame(WS_OPCODES.PING, Buffer.alloc(0));
  }

  /**
   * Close the connection.
   */
  close(): void {
    if (!this.isAlive) return;
    try {
      this.sendFrame(WS_OPCODES.CLOSE, Buffer.alloc(0));
    } catch {
      // Ignore send errors during close
    }
    this.alive = false;
    this.socket.end();
  }

  /**
   * Build and send a WebSocket frame (server → client, unmasked).
   */
  private sendFrame(opcode: number, payload: Buffer): void {
    const len = payload.length;
    let header: Buffer;

    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x80 | opcode; // FIN + opcode
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  /**
   * Parse incoming WebSocket frames (client → server, masked).
   */
  private handleFrame(data: Buffer): void {
    if (data.length < 2) return;

    const opcode = data[0]! & 0x0f;
    const masked = (data[1]! & 0x80) !== 0;
    let payloadLen = data[1]! & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (data.length < 4) return;
      payloadLen = data.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      if (data.length < 10) return;
      payloadLen = Number(data.readBigUInt64BE(2));
      offset = 10;
    }

    if (masked) {
      if (data.length < offset + 4 + payloadLen) return;
      const mask = data.subarray(offset, offset + 4);
      offset += 4;
      const payload = data.subarray(offset, offset + payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = payload[i]! ^ mask[i % 4]!;
      }
    }

    switch (opcode) {
      case WS_OPCODES.CLOSE:
        this.close();
        break;
      case WS_OPCODES.PING:
        this.sendFrame(WS_OPCODES.PONG, data.subarray(offset, offset + payloadLen));
        break;
      case WS_OPCODES.PONG:
        // Heartbeat response — no action needed
        break;
      // TEXT frames from client are ignored (server-push only)
    }
  }
}

// ─── WebSocket Manager ───────────────────────────────────────────────────────

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB863D7B14';
const WS_PATH = '/__neo_hexo_ws';

/**
 * Manages WebSocket connections for live reload.
 */
export class WebSocketManager {
  private connections = new Set<WebSocketConnection>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Try to handle an HTTP upgrade request as a WebSocket connection.
   * Returns true if handled.
   */
  handleUpgrade(
    req: http.IncomingMessage,
    socket: Socket,
  ): boolean {
    const url = req.url ?? '';
    if (url !== WS_PATH) return false;

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return true;
    }

    // Compute accept hash
    const accept = crypto
      .createHash('sha1')
      .update(key + WS_MAGIC)
      .digest('base64');

    // Send upgrade response
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
    );

    const conn = new WebSocketConnection(socket);
    this.connections.add(conn);

    socket.on('close', () => {
      this.connections.delete(conn);
    });

    return true;
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(message: string): void {
    for (const conn of this.connections) {
      if (conn.isAlive) {
        conn.send(message);
      } else {
        this.connections.delete(conn);
      }
    }
  }

  /**
   * Send reload signal to all clients.
   */
  reload(): void {
    this.broadcast(JSON.stringify({ type: 'reload' }));
  }

  /**
   * Send an error to all clients for overlay display.
   */
  sendError(error: { message: string; file?: string; line?: number; stack?: string }): void {
    this.broadcast(JSON.stringify({ type: 'error', ...error }));
  }

  /**
   * Clear error overlay on all clients.
   */
  clearError(): void {
    this.broadcast(JSON.stringify({ type: 'clear-error' }));
  }

  /**
   * Start heartbeat pinging to detect dead connections.
   */
  startHeartbeat(intervalMs = 30_000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      for (const conn of this.connections) {
        if (conn.isAlive) {
          conn.ping();
        } else {
          this.connections.delete(conn);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop heartbeat pinging.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Close all connections and stop heartbeat.
   */
  close(): void {
    this.stopHeartbeat();
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections.clear();
  }

  /**
   * Number of active connections.
   */
  get size(): number {
    return this.connections.size;
  }
}

// ─── Client Script ───────────────────────────────────────────────────────────

/**
 * Generate the WebSocket client script injected into HTML responses.
 */
export function createClientScript(port: number): string {
  return `<script>
(function() {
  var ws = new WebSocket('ws://localhost:${port}${WS_PATH}');
  var overlay = null;

  ws.onmessage = function(e) {
    var msg = JSON.parse(e.data);
    if (msg.type === 'reload') {
      removeOverlay();
      location.reload();
    }
    if (msg.type === 'error') {
      showOverlay(msg);
    }
    if (msg.type === 'clear-error') {
      removeOverlay();
    }
  };

  ws.onclose = function() {
    console.log('[neo-hexo] Dev server disconnected. Attempting to reconnect...');
    setTimeout(function() { location.reload(); }, 1000);
  };

  function showOverlay(err) {
    removeOverlay();
    overlay = document.createElement('div');
    overlay.id = '__neo_hexo_error_overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);color:#ff6b6b;font-family:monospace;font-size:14px;padding:32px;z-index:999999;overflow:auto;white-space:pre-wrap;';

    var close = document.createElement('button');
    close.textContent = '\\u00d7';
    close.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#fff;font-size:24px;cursor:pointer;';
    close.onclick = removeOverlay;

    var title = document.createElement('div');
    title.style.cssText = 'color:#ff6b6b;font-size:18px;font-weight:bold;margin-bottom:8px;';
    title.textContent = 'Build Error';

    var file = document.createElement('div');
    file.style.cssText = 'color:#ffa07a;margin-bottom:16px;';
    file.textContent = (err.file || '') + (err.line ? ':' + err.line : '');

    var message = document.createElement('div');
    message.style.cssText = 'color:#fff;margin-bottom:16px;font-size:16px;';
    message.textContent = err.message || 'Unknown error';

    var stack = document.createElement('pre');
    stack.style.cssText = 'color:#aaa;font-size:12px;line-height:1.5;';
    stack.textContent = err.stack || '';

    overlay.appendChild(close);
    overlay.appendChild(title);
    if (err.file) overlay.appendChild(file);
    overlay.appendChild(message);
    if (err.stack) overlay.appendChild(stack);
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
    }
  }
})();
</script>`;
}

// ─── Lazy Render Cache ───────────────────────────────────────────────────────

interface CachedRender {
  content: string;
  etag: string;
}

/**
 * Cache for lazily rendered route content.
 * Routes are only rendered on first request.
 */
export class LazyRenderCache {
  private cache = new Map<string, CachedRender>();

  get(path: string): CachedRender | undefined {
    return this.cache.get(path);
  }

  set(path: string, content: string): CachedRender {
    const etag = computeETag(content);
    const entry: CachedRender = { content, etag };
    this.cache.set(path, entry);
    return entry;
  }

  /**
   * Invalidate a specific path or all cache.
   */
  invalidate(path?: string): void {
    if (path) {
      this.cache.delete(path);
    } else {
      this.cache.clear();
    }
  }

  get size(): number {
    return this.cache.size;
  }
}

// ─── Dev Server ──────────────────────────────────────────────────────────────

export interface DevServerOptions {
  /** Port to listen on (default: 4000). */
  port?: number;
  /** Host to bind to (default: 'localhost'). */
  host?: string;
  /** Whether to inject live reload script (default: true). */
  liveReload?: boolean;
  /** Whether to open browser on start (default: false). */
  open?: boolean;
  /** Log function (default: console.log). */
  log?: (message: string) => void;
}

/**
 * The development HTTP server.
 * Serves routes from the Router, injects live reload script,
 * provides WebSocket-based live reload and error overlay.
 */
export class DevServer {
  readonly port: number;
  readonly host: string;
  readonly liveReload: boolean;
  readonly ws: WebSocketManager;
  readonly renderCache: LazyRenderCache;

  private server: http.Server | null = null;
  private router: Router | null = null;
  private log: (message: string) => void;
  private clientScript = '';
  private watcher: ReturnType<typeof import('node:fs').watch> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  private fsModule: typeof import('node:fs') | null = null;

  constructor(options: DevServerOptions = {}) {
    this.port = options.port ?? 4000;
    this.host = options.host ?? 'localhost';
    this.liveReload = options.liveReload ?? true;
    this.log = options.log ?? console.log;
    this.ws = new WebSocketManager();
    this.renderCache = new LazyRenderCache();

    if (this.liveReload) {
      this.clientScript = createClientScript(this.port);
    }
  }

  /**
   * Set the router for serving routes.
   */
  setRouter(router: Router): void {
    this.router = router;
  }

  /**
   * Start the HTTP server.
   */
  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        this.log(`[neo-hexo] Request error: ${err instanceof Error ? err.message : String(err)}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      });
    });

    // Handle WebSocket upgrade
    this.server.on('upgrade', (req, socket) => {
      if (!this.ws.handleUpgrade(req, socket as Socket)) {
        socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      }
    });

    // Start heartbeat for WebSocket connections
    this.ws.startHeartbeat();

    return new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, this.host, () => {
        this.log(`[neo-hexo] Dev server running at http://${this.host}:${this.port}/`);
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  /**
   * Stop the HTTP server and clean up.
   */
  async stop(): Promise<void> {
    this.stopWatching();
    this.ws.close();
    this.renderCache.invalidate();

    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
        this.server = null;
      });
    }
  }

  /**
   * Notify all clients to reload.
   */
  notifyReload(): void {
    this.renderCache.invalidate();
    this.ws.clearError();
    this.ws.reload();
  }

  /**
   * Notify all clients of a build error.
   */
  notifyError(error: Error, file?: string): void {
    const errInfo = {
      message: error.message,
      file,
      stack: error.stack,
    };
    this.ws.sendError(errInfo);
    this.log(`[neo-hexo] Build error: ${error.message}`);
  }

  /**
   * Start watching a directory for file changes.
   * Calls `onChange` when a file changes.
   */
  startWatching(dir: string, onChange: (filePath: string) => void): void {
    this.stopWatching();
    try {
      // Dynamic import to avoid top-level sync fs dependency
      if (!this.fsModule) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        this.fsModule = require('node:fs') as typeof import('node:fs');
      }
      this.watcher = this.fsModule.watch(
        dir,
        { recursive: true },
        (_eventType, filename) => {
          if (filename && !this.shouldIgnoreFile(filename)) {
            onChange(nodePath.join(dir, filename));
          }
        },
      );
    } catch {
      // fs.watch may not support recursive on all platforms
      this.log('[neo-hexo] File watching not available on this platform.');
    }
  }

  /**
   * Stop watching for file changes.
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Handle an incoming HTTP request.
   */
  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain', Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    // Parse URL path, decode, and prevent path traversal
    const parsedUrl = new URL(req.url ?? '/', `http://${this.host}`);
    let urlPath = decodeURIComponent(parsedUrl.pathname);

    // Reject path traversal
    if (urlPath.includes('..')) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // Normalize: strip leading slash for Router key format
    urlPath = urlPath.replace(/^\/+/, '');
    if (urlPath === '' || urlPath.endsWith('/')) {
      urlPath += 'index.html';
    }

    // Try to serve from Router
    if (this.router) {
      const content = await this.resolveRoute(urlPath);
      if (content !== null) {
        this.serveContent(req, res, urlPath, content);
        return;
      }
    }

    // 404
    const notFound = this.render404(urlPath);
    res.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(notFound);
  }

  /**
   * Resolve route content with lazy render cache.
   */
  private async resolveRoute(path: string): Promise<string | null> {
    // Check lazy cache first
    const cached = this.renderCache.get(path);
    if (cached) return cached.content;

    // Resolve from router
    if (!this.router) return null;
    const content = await this.router.resolve(path);
    if (content === null) return null;

    // Cache the result
    this.renderCache.set(path, content);
    return content;
  }

  /**
   * Serve resolved content with proper headers, ETag, and live reload injection.
   */
  private serveContent(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    path: string,
    content: string,
  ): void {
    const mime = getMimeType(path);
    const etag = computeETag(content);

    // 304 Not Modified
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.writeHead(304);
      res.end();
      return;
    }

    // Inject live reload script into HTML
    let body = content;
    if (this.liveReload && mime.startsWith('text/html')) {
      body = this.injectClientScript(body);
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': Buffer.byteLength(body),
      'ETag': etag,
      'Cache-Control': 'no-cache',
      'X-Powered-By': 'neo-hexo',
    });
    res.end(body);
  }

  /**
   * Inject the WebSocket client script into HTML.
   */
  private injectClientScript(html: string): string {
    // Inject before </body> or at end of document
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose !== -1) {
      return html.slice(0, bodyClose) + this.clientScript + html.slice(bodyClose);
    }
    return html + this.clientScript;
  }

  /**
   * Render a 404 page.
   */
  private render404(path: string): string {
    const escapedPath = path
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return `<!DOCTYPE html>
<html>
<head><title>404 Not Found — Neo-Hexo</title></head>
<body style="font-family:system-ui;padding:40px;background:#1a1a1a;color:#fff;">
<h1 style="color:#ff6b6b;">404 Not Found</h1>
<p>The requested path <code style="background:#333;padding:2px 6px;border-radius:3px;">/${escapedPath}</code> was not found.</p>
<hr style="border-color:#333;"/>
<p style="color:#888;">Neo-Hexo Dev Server</p>
${this.liveReload ? this.clientScript : ''}
</body>
</html>`;
  }

  /**
   * Check if a file should be ignored for watch events.
   */
  private shouldIgnoreFile(filename: string): boolean {
    const basename = nodePath.basename(filename);
    return (
      basename.startsWith('.') ||
      basename.endsWith('~') ||
      basename.endsWith('.swp') ||
      basename.endsWith('.swo') ||
      basename.includes('___jb_') || // JetBrains temp files
      basename === 'node_modules'
    );
  }
}

// ─── Server Plugin ───────────────────────────────────────────────────────────

export interface ServerPluginOptions {
  /** Port (default: 4000). */
  port?: number;
  /** Host (default: 'localhost'). */
  host?: string;
  /** Enable live reload (default: true). */
  liveReload?: boolean;
  /** Open browser on start (default: false). */
  open?: boolean;
}

/**
 * Create the server plugin.
 *
 * Registers a `server` command in the CommandRegistry:
 *   neo-hexo server [--port 4000] [--host localhost]
 */
export default function serverPlugin(options: ServerPluginOptions = {}): NeoHexoPlugin {
  let server: DevServer | null = null;
  let router: Router | null = null;

  return {
    name: '@neo-hexo/server',
    enforce: 'post' as const,

    apply(ctx: Context) {
      router = ctx.inject(RouterServiceKey);

      // Register "server" command
      const commands = ctx.inject(CommandRegistryKey);
      commands.register({
        name: 'server',
        description: 'Start the development server.',
        usage: 'neo-hexo server [--port 4000] [--host localhost]',
        handler: async (args) => {
          const port = typeof args.port === 'number' ? args.port : options.port;
          const host = typeof args.host === 'string' ? args.host : options.host;

          server = new DevServer({
            port,
            host,
            liveReload: options.liveReload,
          });

          server.setRouter(router!);
          await server.start();

          // Keep the process alive until Ctrl+C
          return new Promise<void>((resolve) => {
            const shutdown = async () => {
              if (server) {
                await server.stop();
                server = null;
              }
              resolve();
            };
            process.on('SIGINT', () => void shutdown());
            process.on('SIGTERM', () => void shutdown());
          });
        },
      });

      return {
        dispose() {
          if (server) {
            void server.stop();
            server = null;
          }
        },
      };
    },
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export type { CachedRender };
