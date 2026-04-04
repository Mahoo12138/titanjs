/**
 * @titan/vite-plugin - Vite integration for Titan SSG
 *
 * Responsibilities:
 * - Bridge Markdown asset references into Vite's module graph
 *   via virtual modules so Vite processes/hashes them
 * - Provide dev server middleware for on-demand page rendering
 * - Handle HMR for Markdown content changes with precise route invalidation
 * - Send custom ws events for route-level refresh (no full-reload)
 */
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { TitanConfig } from "@titan/types";
import type { DevSession, FileChangeResult } from "@titan/core";

export interface TitanVitePluginOptions {
  /** Project root */
  rootDir: string;
  /** Titan config */
  config: TitanConfig;
  /** DevSession instance (for dev mode on-demand rendering) */
  devSession?: DevSession;
  /** Callback when a source file changes (for dev mode rebuild) */
  onFileChange?: (filePath: string, result: FileChangeResult) => void;
  /** Callback when a theme file changes */
  onThemeChange?: (filePath: string) => void;
}

const VIRTUAL_ASSETS_ID = "virtual:titan-assets";
const RESOLVED_VIRTUAL_ASSETS_ID = "\0" + VIRTUAL_ASSETS_ID;
const ISLAND_PREFIX = "/assets/islands/";
const RESOLVED_ISLAND_PREFIX = "\0titan-island:";

/**
 * Create the Titan Vite plugin
 */
export function titanVitePlugin(options: TitanVitePluginOptions): Plugin {
  const { rootDir, config, devSession, onFileChange, onThemeChange } = options;
  const sourceDir = path.join(rootDir, config.source);

  // Resolve theme directory for watching
  const themeRef = config.theme;
  const themeName =
    typeof themeRef === "string"
      ? themeRef
      : typeof themeRef === "object"
        ? themeRef.name
        : null;
  const themeDir = themeName ? path.join(rootDir, "themes", themeName) : null;
  const themeExtensions = new Set([
    ".tsx",
    ".jsx",
    ".ts",
    ".js",
    ".mjs",
    ".css",
  ]);

  // Collected asset paths from Markdown processing
  let assetImports: string[] = [];
  let server: ViteDevServer | null = null;

  return {
    name: "titan",
    enforce: "pre",

    // Resolve virtual module for assets and island stubs
    resolveId(id) {
      if (id === VIRTUAL_ASSETS_ID) {
        return RESOLVED_VIRTUAL_ASSETS_ID;
      }
      // In dev mode, island JS files don't exist on disk — resolve them as virtual modules
      if (id.startsWith(ISLAND_PREFIX) && id.endsWith(".js")) {
        const name = id.slice(ISLAND_PREFIX.length, -3);
        return RESOLVED_ISLAND_PREFIX + name;
      }
    },

    // Generate virtual module content: import all collected assets
    load(id) {
      if (id === RESOLVED_VIRTUAL_ASSETS_ID) {
        const imports = assetImports.map(
          (asset, i) => `import asset${i} from ${JSON.stringify(asset)}`,
        );
        const exports = assetImports.map((_, i) => `asset${i}`);
        return [...imports, `export default { ${exports.join(", ")} }`].join(
          "\n",
        );
      }
      // Serve stub island modules in dev mode (SSR markup is already rendered)
      if (id.startsWith(RESOLVED_ISLAND_PREFIX)) {
        return `export default function IslandStub() { return null; }`;
      }
    },

    // Dev server configuration
    configureServer(viteServer: ViteDevServer) {
      server = viteServer;

      // Watch source directory for changes
      viteServer.watcher.add(sourceDir);

      // Watch theme directory for layout/style/config changes
      if (themeDir) {
        viteServer.watcher.add(themeDir);
      }

      viteServer.watcher.on("change", async (filePath) => {
        // Theme file change: reload theme and invalidate all caches
        if (
          themeDir &&
          filePath.startsWith(themeDir) &&
          themeExtensions.has(path.extname(filePath))
        ) {
          if (devSession) {
            try {
              const result = await devSession.reloadTheme();
              onThemeChange?.(filePath);

              // Notify all pages to reload
              viteServer.ws.send({
                type: "custom",
                event: "titan:routes-updated",
                data: {
                  affectedRoutes: result.invalidatedRoutes,
                  entryId: null,
                  frontmatterChanged: true,
                },
              });
            } catch (error) {
              viteServer.config.logger.warn(
                `[titan] theme reload failed for ${path.relative(rootDir, filePath)}: ${(error as Error).message}`,
              );
              viteServer.ws.send({ type: "full-reload" });
            }
          } else {
            viteServer.ws.send({ type: "full-reload" });
          }
          return;
        }

        // Source file change: re-transform and compute affected routes
        if (!filePath.startsWith(sourceDir) || !filePath.endsWith(".md"))
          return;

        if (devSession) {
          try {
            // Precise HMR: re-transform changed file and compute affected routes
            const result = await devSession.handleFileChange(filePath);

            onFileChange?.(filePath, result);

            if (result.affectedRoutes.length > 0) {
              // Send custom event with affected routes for targeted refresh
              viteServer.ws.send({
                type: "custom",
                event: "titan:routes-updated",
                data: {
                  affectedRoutes: result.affectedRoutes,
                  entryId: result.entryId,
                  frontmatterChanged: result.frontmatterChanged,
                },
              });
            }
          } catch (error) {
            viteServer.config.logger.warn(
              `[titan] falling back to route reload for ${path.relative(rootDir, filePath)}: ${(error as Error).message}`,
            );

            viteServer.ws.send({
              type: "custom",
              event: "titan:routes-updated",
              data: {
                affectedRoutes: devSession
                  .getRoutes()
                  .map((route) => route.url),
                entryId: null,
                frontmatterChanged: true,
              },
            });
          }
        } else {
          // Fallback: full-reload
          viteServer.ws.send({ type: "full-reload" });
        }
      });

      // On-demand page rendering middleware
      // Must return before Vite's own static middleware to intercept HTML requests
      return () => {
        viteServer.middlewares.use(async (req, res, next) => {
          if (!devSession) return next();

          // Only handle GET requests for HTML pages
          const method = req.method?.toUpperCase();
          if (method !== "GET") return next();

          let urlPath = req.url || "/";
          urlPath = urlPath.split("?")[0];
          try {
            urlPath = decodeURIComponent(urlPath);
          } catch {
            /* malformed */
          }

          // Skip asset requests (files with extensions other than .html)
          const ext = path.extname(urlPath);
          if (ext && ext !== ".html") return next();

          // Normalize: /foo → /foo/, /foo/ stays
          if (!urlPath.endsWith("/") && !ext) urlPath += "/";

          // Try to find a matching route
          const route = devSession.getRouteForUrl(urlPath);
          if (!route) return next();

          try {
            const html = await devSession.renderOnDemand(urlPath);
            if (!html) return next();

            // Inject HMR client script
            const hmrScript = `
<script type="module">
  if (import.meta.hot) {
    import.meta.hot.on('titan:routes-updated', (data) => {
      const currentPath = window.location.pathname
      const normalized = currentPath.endsWith('/') ? currentPath : currentPath + '/'
      if (data.affectedRoutes.includes(normalized) || data.affectedRoutes.includes(currentPath)) {
        window.location.reload()
      }
    })
  }
</script>`;

            const injectedHtml = html.replace(
              "</head>",
              hmrScript + "\n</head>",
            );

            // Transform through Vite's pipeline (for HMR client injection)
            const transformed = await viteServer.transformIndexHtml(
              urlPath,
              injectedHtml,
            );

            res.writeHead(200, {
              "Content-Type": "text/html",
              "Content-Length": Buffer.byteLength(transformed),
            });
            res.end(transformed);
          } catch (err) {
            viteServer.ssrFixStacktrace(err as Error);
            next(err);
          }
        });
      };
    },

    // Build configuration
    config() {
      return {
        build: {
          outDir: path.join(rootDir, config.build.outDir),
          emptyOutDir: true,
        },
      };
    },
  };
}

/**
 * Update the asset imports list (called from Engine during transform)
 */
export function setAssetImports(imports: string[]): void {
  // This will be used to populate the virtual module
  // In a full implementation, this would communicate with the plugin instance
}

export { titanVitePlugin as default };
