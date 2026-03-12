/**
 * @neo-hexo/server — Integration Tests
 *
 * Tests the server plugin integration with NeoHexo,
 * including command registration and WebSocket handshake.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import serverPlugin, { DevServer } from '../src/index.js';
import {
  Context,
  CommandRegistry,
  CommandRegistryKey,
  Router,
  RouterServiceKey,
} from '@neo-hexo/core';

// ─── Plugin Factory ──────────────────────────────────────────────────────────

describe('serverPlugin factory', () => {
  it('should return a valid NeoHexoPlugin', () => {
    const plugin = serverPlugin();
    expect(plugin.name).toBe('@neo-hexo/server');
    expect(plugin.enforce).toBe('post');
    expect(plugin.apply).toBeTypeOf('function');
  });

  it('should accept custom options', () => {
    const plugin = serverPlugin({ port: 5000, host: '0.0.0.0' });
    expect(plugin.name).toBe('@neo-hexo/server');
  });

  it('should register "server" command when applied', () => {
    const ctx = new Context();
    const commands = new CommandRegistry();
    const router = new Router();
    ctx.provide(CommandRegistryKey, commands);
    ctx.provide(RouterServiceKey, router);

    const plugin = serverPlugin();
    plugin.apply!(ctx);

    expect(commands.has('server')).toBe(true);
  });

  it('should return a disposable from apply', () => {
    const ctx = new Context();
    const commands = new CommandRegistry();
    const router = new Router();
    ctx.provide(CommandRegistryKey, commands);
    ctx.provide(RouterServiceKey, router);

    const plugin = serverPlugin();
    const disposable = plugin.apply!(ctx);
    expect(disposable).toBeDefined();
    expect(typeof (disposable as { dispose: () => void }).dispose).toBe('function');
  });
});

// ─── WebSocket Handshake Integration ─────────────────────────────────────────

/**
 * Perform a raw HTTP upgrade request and return the response.
 */
function rawUpgrade(port: number, path: string, key: string): Promise<{ status: string; headers: Record<string, string>; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, 'localhost', () => {
      socket.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: localhost:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `\r\n`,
      );
    });

    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headerSection = buffer.slice(0, headerEnd);
        const lines = headerSection.split('\r\n');
        const status = lines[0]!;
        const headers: Record<string, string> = {};
        for (let i = 1; i < lines.length; i++) {
          const idx = lines[i]!.indexOf(': ');
          if (idx > 0) {
            headers[lines[i]!.slice(0, idx).toLowerCase()] = lines[i]!.slice(idx + 2);
          }
        }
        resolve({ status, headers, socket });
      }
    });

    socket.on('error', reject);
    setTimeout(() => reject(new Error('Upgrade timeout')), 3000);
  });
}

describe('DevServer WebSocket handshake', () => {
  let server: DevServer;

  afterEach(async () => {
    await server?.stop();
  });

  it('should accept WebSocket upgrade on correct path', async () => {
    server = new DevServer({ port: 18780, log: () => {} });
    await server.start();

    const key = Buffer.from('test-key-12345678').toString('base64');
    const { status, headers, socket } = await rawUpgrade(18780, '/__neo_hexo_ws', key);

    expect(status).toContain('101');
    expect(headers['upgrade']).toBe('websocket');
    expect(headers['connection']).toBe('Upgrade');
    expect(headers['sec-websocket-accept']).toBeDefined();

    // Verify the accept hash is correct per RFC 6455
    const expectedAccept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB863D7B14')
      .digest('base64');
    expect(headers['sec-websocket-accept']).toBe(expectedAccept);

    expect(server.ws.size).toBe(1);

    socket.end();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('should reject non-WebSocket path upgrades', async () => {
    server = new DevServer({ port: 18781, log: () => {} });
    await server.start();

    const key = Buffer.from('test-key-12345678').toString('base64');
    const { status, socket } = await rawUpgrade(18781, '/wrong-path', key);

    expect(status).toContain('404');

    socket.end();
    await new Promise((r) => setTimeout(r, 50));
  });

  it('should broadcast messages to connected WebSocket clients', async () => {
    server = new DevServer({ port: 18782, log: () => {} });
    await server.start();

    const key = Buffer.from('test-key-12345678').toString('base64');
    const { socket } = await rawUpgrade(18782, '/__neo_hexo_ws', key);

    // Collect data after the upgrade
    const frames: Buffer[] = [];
    socket.on('data', (data) => {
      frames.push(data);
    });

    // Give a bit for the connection to stabilize
    await new Promise((r) => setTimeout(r, 50));

    // Broadcast a message
    server.ws.broadcast('{"type":"test"}');

    await new Promise((r) => setTimeout(r, 100));

    // Should have received at least one WebSocket frame
    expect(frames.length).toBeGreaterThan(0);

    // Parse the WebSocket text frame
    const frame = frames[0]!;
    const opcode = frame[0]! & 0x0f;
    expect(opcode).toBe(1); // TEXT frame

    let payloadStart = 2;
    let payloadLen = frame[1]! & 0x7f;
    if (payloadLen === 126) {
      payloadLen = frame.readUInt16BE(2);
      payloadStart = 4;
    }

    const payload = frame.subarray(payloadStart, payloadStart + payloadLen).toString('utf-8');
    expect(JSON.parse(payload)).toEqual({ type: 'test' });

    socket.end();
    await new Promise((r) => setTimeout(r, 50));
  });
});

// ─── File watching ───────────────────────────────────────────────────────────

describe('DevServer file watching', () => {
  let server: DevServer;

  afterEach(async () => {
    await server?.stop();
  });

  it('should start and stop watching without error', () => {
    server = new DevServer({ port: 18783, log: () => {} });
    server.startWatching(process.cwd(), () => {});
    server.stopWatching();
  });

  it('should handle stop watching when not watching', () => {
    server = new DevServer({ port: 18784, log: () => {} });
    // Should not throw
    server.stopWatching();
  });
});
