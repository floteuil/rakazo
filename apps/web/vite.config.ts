import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type PreviewServer, type ViteDevServer } from "vite";
import { resolveAuthSecret } from "../../packages/core/src/secrets-guard.ts";
import {
  resolveNovncTarget,
  safeProxyHeaders,
  safeProxyResponseHeaders,
  stripSensitiveHandshakeHeaders,
} from "./src/screen-proxy.js";

const webPort = Number(process.env.WEB_PORT ?? 5173);

function attachNovncProxy(server: ViteDevServer | PreviewServer, secret: string) {
  server.middlewares.use((req, res, next) => {
    if (!req.url?.startsWith("/novnc/")) {
      next();
      return;
    }
    const target = resolveNovncTarget(req.url, secret);
    if (!target) {
      res.statusCode = 403;
      res.end("Invalid or expired screen capability");
      return;
    }
    const headers = {
      ...safeProxyHeaders(req.headers),
      host: `${target.hostname}:${target.port}`,
    };
    const transport = target.protocol === "https:" ? https : http;
    const upstream = transport.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.path,
        method: req.method,
        headers,
        ...(target.protocol === "https:" ? { servername: target.hostname } : {}),
      },
      (incoming) => {
        res.writeHead(incoming.statusCode ?? 502, {
          ...safeProxyResponseHeaders(incoming.headers),
          "access-control-allow-origin": "*",
        });
        incoming.pipe(res);
      },
    );
    upstream.on("error", (error) => {
      res.statusCode = 502;
      res.end(error.message);
    });
    req.pipe(upstream);
  });

  server.httpServer?.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/novnc/")) return;
    const target = resolveNovncTarget(req.url, secret);
    if (!target) {
      socket.destroy();
      return;
    }
    const upstream =
      target.protocol === "https:"
        ? tls.connect({ port: target.port, host: target.hostname, servername: target.hostname })
        : net.connect(target.port, target.hostname);
    upstream.once(target.protocol === "https:" ? "secureConnect" : "connect", () => {
      const headerLines = [
        `${req.method ?? "GET"} ${target.path} HTTP/1.1`,
        `Host: ${target.hostname}:${target.port}`,
      ];
      for (const [key, value] of Object.entries(safeProxyHeaders(req.headers))) {
        headerLines.push(`${key}: ${Array.isArray(value) ? value.join(",") : value}`);
      }
      upstream.write(`${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      const responseChunks: Buffer[] = [];
      let responseSize = 0;
      let responseTail = Buffer.alloc(0);
      const forwardHandshake = (chunk: Buffer) => {
        responseChunks.push(chunk);
        responseSize += chunk.length;
        if (responseSize > 64 * 1024) {
          socket.destroy();
          upstream.destroy();
          return;
        }
        const boundarySearch = Buffer.concat([responseTail, chunk]);
        if (boundarySearch.indexOf("\r\n\r\n") < 0) {
          responseTail = Buffer.from(boundarySearch.subarray(-3));
          return;
        }
        const responseHead = Buffer.concat(responseChunks, responseSize);
        const safe = stripSensitiveHandshakeHeaders(responseHead);
        if (!safe) {
          socket.destroy();
          upstream.destroy();
          return;
        }
        upstream.off("data", forwardHandshake);
        socket.write(safe);
        upstream.pipe(socket);
      };
      upstream.on("data", forwardHandshake);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
}

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  const api = process.env.API_PROXY_TARGET ?? rootEnv.API_PROXY_TARGET ?? "http://127.0.0.1:3100";
  const previewHost = process.env.RAKAZO_HOST ?? rootEnv.RAKAZO_HOST ?? "localhost";
  const getScreenProxySecret = () =>
    resolveAuthSecret({
      ...process.env,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? rootEnv.BETTER_AUTH_SECRET,
    });
  const performanceAssetDelayMs = Number(process.env.RAKAZO_PERFORMANCE_ASSET_DELAY_MS ?? 0);
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "rakazo-performance-asset-delay",
        configurePreviewServer(server) {
          if (!Number.isFinite(performanceAssetDelayMs) || performanceAssetDelayMs <= 0) return;
          server.middlewares.use((req, _res, next) => {
            const pathname = req.url?.split("?", 1)[0] ?? "/";
            if (["/api", "/rpc", "/novnc"].some((prefix) => pathname.startsWith(prefix))) {
              next();
              return;
            }
            setTimeout(next, performanceAssetDelayMs);
          });
        },
      },
      {
        name: "rakazo-novnc-proxy",
        configureServer: (server) => attachNovncProxy(server, getScreenProxySecret()),
        configurePreviewServer: (server) => attachNovncProxy(server, getScreenProxySecret()),
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/react-router") ||
              id.includes("node_modules/scheduler/")
            ) {
              return "vendor-react";
            }
            if (id.includes("node_modules/lucide-react/")) {
              return "vendor-icons";
            }
            if (
              id.includes("node_modules/react-markdown") ||
              id.includes("node_modules/remark-") ||
              id.includes("node_modules/rehype-") ||
              id.includes("node_modules/unified") ||
              id.includes("node_modules/micromark") ||
              id.includes("node_modules/mdast") ||
              id.includes("node_modules/hast") ||
              id.includes("node_modules/vfile") ||
              id.includes("node_modules/unist")
            ) {
              return "vendor-markdown";
            }
            if (
              id.includes("packages/contracts/src/sovereign-skills-catalog") ||
              id.includes("packages/contracts/src/mcp-catalog") ||
              id.includes("packages/contracts/src/agent-blueprints")
            ) {
              return "rakazo-catalogs";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": { target: api, changeOrigin: true },
        "/rpc": { target: api, changeOrigin: true },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.WEB_PORT ?? 5173),
      allowedHosts: [previewHost],
      proxy: {
        "/api": { target: api, changeOrigin: true },
        "/rpc": { target: api, changeOrigin: true },
      },
    },
  };
});
