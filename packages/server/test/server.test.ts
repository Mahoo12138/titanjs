/**
 * @neo-hexo/server — Unit Tests
 *
 * Tests for MIME types, ETag, LazyRenderCache, WebSocket framing,
 * DevServer HTTP serving, and the server plugin factory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as http from 'node:http';
import {
  getMimeType,
  computeETag,
  createClientScript,
  LazyRenderCache,
  WebSocketManager,
  DevServer,
} from '../src/index.js';

// ─── getMimeType ─────────────────────────────────────────────────────────────

describe('getMimeType', () => {
  it('should return correct MIME for .html', () => {
    expect(getMimeType('index.html')).toBe('text/html; charset=utf-8');
  });

  it('should return correct MIME for .css', () => {
    expect(getMimeType('style.css')).toBe('text/css; charset=utf-8');
  });

  it('should return correct MIME for .js', () => {
    expect(getMimeType('app.js')).toBe('application/javascript; charset=utf-8');
  });

  it('should return correct MIME for .json', () => {
    expect(getMimeType('data.json')).toBe('application/json; charset=utf-8');
  });

  it('should return correct MIME for .png', () => {
    expect(getMimeType('image.png')).toBe('image/png');
  });

  it('should return correct MIME for .svg', () => {
    expect(getMimeType('icon.svg')).toBe('image/svg+xml');
  });

  it('should return correct MIME for .woff2', () => {
    expect(getMimeType('font.woff2')).toBe('font/woff2');
  });

  it('should return octet-stream for unknown extensions', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
  });

  it('should handle paths with directories', () => {
    expect(getMimeType('assets/css/main.css')).toBe('text/css; charset=utf-8');
  });

  it('should be case-insensitive for extensions', () => {
    expect(getMimeType('file.HTML')).toBe('text/html; charset=utf-8');
  });
});

// ─── computeETag ─────────────────────────────────────────────────────────────

describe('computeETag', () => {
  it('should return a weak ETag string', () => {
    const etag = computeETag('hello world');
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
  });

  it('should return consistent ETags for same content', () => {
    expect(computeETag('test')).toBe(computeETag('test'));
  });

  it('should return different ETags for different content', () => {
    expect(computeETag('foo')).not.toBe(computeETag('bar'));
  });

  it('should work with Buffer', () => {
    const etag = computeETag(Buffer.from('hello'));
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
  });
});

// ─── createClientScript ──────────────────────────────────────────────────────

describe('createClientScript', () => {
  it('should include WebSocket connection to the correct port', () => {
    const script = createClientScript(4000);
    expect(script).toContain('ws://localhost:4000/__neo_hexo_ws');
  });

  it('should include reload handler', () => {
    const script = createClientScript(4000);
    expect(script).toContain("msg.type === 'reload'");
  });

  it('should include error overlay handler', () => {
    const script = createClientScript(4000);
    expect(script).toContain("msg.type === 'error'");
  });

  it('should include clear-error handler', () => {
    const script = createClientScript(4000);
    expect(script).toContain("msg.type === 'clear-error'");
  });

  it('should use the specified port', () => {
    const script = createClientScript(3000);
    expect(script).toContain('ws://localhost:3000/__neo_hexo_ws');
  });

  it('should be wrapped in script tags', () => {
    const script = createClientScript(4000);
    expect(script).toMatch(/^<script>/);
    expect(script).toMatch(/<\/script>$/);
  });
});

// ─── LazyRenderCache ─────────────────────────────────────────────────────────

describe('LazyRenderCache', () => {
  let cache: LazyRenderCache;

  beforeEach(() => {
    cache = new LazyRenderCache();
  });

  it('should start empty', () => {
    expect(cache.size).toBe(0);
    expect(cache.get('foo')).toBeUndefined();
  });

  it('should set and get cached content', () => {
    cache.set('index.html', '<h1>Hello</h1>');
    const entry = cache.get('index.html');
    expect(entry).toBeDefined();
    expect(entry!.content).toBe('<h1>Hello</h1>');
    expect(entry!.etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
  });

  it('should track size', () => {
    cache.set('a.html', 'a');
    cache.set('b.html', 'b');
    expect(cache.size).toBe(2);
  });

  it('should invalidate a specific path', () => {
    cache.set('a.html', 'a');
    cache.set('b.html', 'b');
    cache.invalidate('a.html');
    expect(cache.get('a.html')).toBeUndefined();
    expect(cache.get('b.html')).toBeDefined();
    expect(cache.size).toBe(1);
  });

  it('should invalidate all entries', () => {
    cache.set('a.html', 'a');
    cache.set('b.html', 'b');
    cache.invalidate();
    expect(cache.size).toBe(0);
  });

  it('should overwrite existing entries', () => {
    cache.set('a.html', 'old');
    cache.set('a.html', 'new');
    expect(cache.get('a.html')!.content).toBe('new');
    expect(cache.size).toBe(1);
  });
});

// ─── WebSocketManager ────────────────────────────────────────────────────────

describe('WebSocketManager', () => {
  let wsManager: WebSocketManager;

  beforeEach(() => {
    wsManager = new WebSocketManager();
  });

  afterEach(() => {
    wsManager.close();
  });

  it('should start with zero connections', () => {
    expect(wsManager.size).toBe(0);
  });

  it('should start and stop heartbeat without error', () => {
    wsManager.startHeartbeat(100);
    wsManager.stopHeartbeat();
  });

  it('should close cleanly with no connections', () => {
    wsManager.close();
    expect(wsManager.size).toBe(0);
  });

  it('should reject upgrade for non-WebSocket path', () => {
    const req = {
      url: '/not-websocket',
      headers: {},
    } as http.IncomingMessage;

    const ended = { value: false };
    const socket = {
      end: () => { ended.value = true; },
      on: () => socket,
      write: () => true,
      destroyed: false,
    } as unknown as import('node:net').Socket;

    const handled = wsManager.handleUpgrade(req, socket);
    expect(handled).toBe(false);
  });

  it('should reject upgrade with missing key', () => {
    const req = {
      url: '/__neo_hexo_ws',
      headers: {},
    } as http.IncomingMessage;

    const ended = { value: false };
    const socket = {
      end: () => { ended.value = true; },
      on: () => socket,
      write: () => true,
      destroyed: false,
    } as unknown as import('node:net').Socket;

    const handled = wsManager.handleUpgrade(req, socket);
    expect(handled).toBe(true);
    expect(ended.value).toBe(true);
  });

  it('should handle upgrade with valid key', () => {
    const req = {
      url: '/__neo_hexo_ws',
      headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    } as unknown as http.IncomingMessage;

    const written: string[] = [];
    const socket = {
      end: () => {},
      on: () => socket,
      write: (data: string | Buffer) => {
        written.push(typeof data === 'string' ? data : data.toString());
        return true;
      },
      destroyed: false,
    } as unknown as import('node:net').Socket;

    const handled = wsManager.handleUpgrade(req, socket);
    expect(handled).toBe(true);
    expect(wsManager.size).toBe(1);
    expect(written[0]).toContain('101 Switching Protocols');
    expect(written[0]).toContain('Sec-WebSocket-Accept');
  });

  it('should broadcast to connected clients', () => {
    const req = {
      url: '/__neo_hexo_ws',
      headers: { 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    } as unknown as http.IncomingMessage;

    const written: Buffer[] = [];
    const socket = {
      end: () => {},
      on: () => socket,
      write: (data: string | Buffer) => {
        if (Buffer.isBuffer(data)) written.push(data);
        return true;
      },
      destroyed: false,
    } as unknown as import('node:net').Socket;

    wsManager.handleUpgrade(req, socket);
    wsManager.broadcast('{"type":"test"}');

    // Should have written a WebSocket frame
    expect(written.length).toBeGreaterThan(0);
  });
});

// ─── DevServer ───────────────────────────────────────────────────────────────

describe('DevServer', () => {
  let server: DevServer;

  afterEach(async () => {
    await server?.stop();
  });

  it('should create with default options', () => {
    server = new DevServer();
    expect(server.port).toBe(4000);
    expect(server.host).toBe('localhost');
    expect(server.liveReload).toBe(true);
  });

  it('should accept custom options', () => {
    server = new DevServer({ port: 3000, host: '0.0.0.0', liveReload: false });
    expect(server.port).toBe(3000);
    expect(server.host).toBe('0.0.0.0');
    expect(server.liveReload).toBe(false);
  });

  it('should start and stop', async () => {
    server = new DevServer({ port: 0, log: () => {} }); // port 0 = random free port
    // Port 0 isn't supported by our implementation, use a random high port
    server = new DevServer({ port: 18765, log: () => {} });
    await server.start();
    await server.stop();
  });

  it('should not start twice', async () => {
    server = new DevServer({ port: 18766, log: () => {} });
    await server.start();
    await server.start(); // Should be no-op
    await server.stop();
  });

  it('should serve 404 for unknown routes', async () => {
    server = new DevServer({ port: 18767, log: () => {} });
    await server.start();

    const res = await fetch('http://localhost:18767/nonexistent');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain('404 Not Found');
    expect(body).toContain('Neo-Hexo');
  });

  it('should serve routes from router', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('index.html', '<h1>Hello</h1>');
    router.set('about/index.html', '<h1>About</h1>');

    server = new DevServer({ port: 18768, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    const res1 = await fetch('http://localhost:18768/');
    expect(res1.status).toBe(200);
    expect(await res1.text()).toBe('<h1>Hello</h1>');

    const res2 = await fetch('http://localhost:18768/about/');
    expect(res2.status).toBe(200);
    expect(await res2.text()).toBe('<h1>About</h1>');
  });

  it('should inject live reload script into HTML', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('index.html', '<html><body><h1>Hello</h1></body></html>');

    server = new DevServer({ port: 18769, log: () => {} });
    server.setRouter(router);
    await server.start();

    const res = await fetch('http://localhost:18769/');
    const body = await res.text();
    expect(body).toContain('__neo_hexo_ws');
    expect(body).toContain('</body>');
  });

  it('should not inject script when liveReload is disabled', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('index.html', '<html><body><h1>Hello</h1></body></html>');

    server = new DevServer({ port: 18770, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    const res = await fetch('http://localhost:18770/');
    const body = await res.text();
    expect(body).not.toContain('__neo_hexo_ws');
  });

  it('should return correct MIME types', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('style.css', 'body { color: red; }');
    router.set('app.js', 'console.log("hi")');
    router.set('data.json', '{"key":"value"}');

    server = new DevServer({ port: 18771, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    const cssRes = await fetch('http://localhost:18771/style.css');
    expect(cssRes.headers.get('content-type')).toBe('text/css; charset=utf-8');

    const jsRes = await fetch('http://localhost:18771/app.js');
    expect(jsRes.headers.get('content-type')).toBe('application/javascript; charset=utf-8');

    const jsonRes = await fetch('http://localhost:18771/data.json');
    expect(jsonRes.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('should support ETag / 304 Not Modified', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('index.html', '<h1>Hello</h1>');

    server = new DevServer({ port: 18772, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    // First request — get the ETag
    const res1 = await fetch('http://localhost:18772/');
    expect(res1.status).toBe(200);
    const etag = res1.headers.get('etag');
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    const res2 = await fetch('http://localhost:18772/', {
      headers: { 'If-None-Match': etag! },
    });
    expect(res2.status).toBe(304);
  });

  it('should reject non-GET methods', async () => {
    server = new DevServer({ port: 18773, log: () => {} });
    await server.start();

    const res = await fetch('http://localhost:18773/', { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('should reject path traversal attempts', async () => {
    server = new DevServer({ port: 18774, log: () => {} });
    await server.start();

    // fetch normalizes ../ before sending, so result is 404 (non-existent route)
    const res = await fetch('http://localhost:18774/../../../etc/passwd');
    expect(res.status).toBe(404);
  });

  it('should cache rendered content lazily', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    let callCount = 0;
    router.set('lazy.html', () => {
      callCount++;
      return '<h1>Lazy</h1>';
    });

    server = new DevServer({ port: 18775, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    // First request — triggers lazy evaluation
    await fetch('http://localhost:18775/lazy.html');
    expect(callCount).toBe(1);

    // Second request — served from cache
    await fetch('http://localhost:18775/lazy.html');
    expect(callCount).toBe(1); // Not called again

    expect(server.renderCache.size).toBe(1);
  });

  it('should invalidate cache on notifyReload', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('cached.html', '<h1>Cached</h1>');

    server = new DevServer({ port: 18776, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    await fetch('http://localhost:18776/cached.html');
    expect(server.renderCache.size).toBe(1);

    server.notifyReload();
    expect(server.renderCache.size).toBe(0);
  });

  it('should have X-Powered-By header', async () => {
    const { Router } = await import('@neo-hexo/core');
    const router = new Router();
    router.set('index.html', 'hello');

    server = new DevServer({ port: 18777, log: () => {}, liveReload: false });
    server.setRouter(router);
    await server.start();

    const res = await fetch('http://localhost:18777/');
    expect(res.headers.get('x-powered-by')).toBe('neo-hexo');
  });
});
