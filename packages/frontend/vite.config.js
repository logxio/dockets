import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import net from "node:net";

function normalizeUpstream(u) {
  const s = String(u ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  return s.endsWith("/v1") ? s.slice(0, -3) : s;
}

async function canConnectLocal(port, { host = "127.0.0.1", timeoutMs = 120 } = {}) {
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function resolveApiProxyTarget() {
  const explicit = String(process.env.VITE_API_PROXY_TARGET ?? "").trim();
  if (explicit) return explicit;

  // Prefer 8001 for local dev (common in this project), else fall back to 8000.
  if (await canConnectLocal(8001)) return "http://127.0.0.1:8001";
  if (await canConnectLocal(8000)) return "http://127.0.0.1:8000";
  return "http://127.0.0.1:8001";
}

const LLM_UPSTREAM = normalizeUpstream(process.env.MCCC_LLM_UPSTREAM);
const VITE_LLM_API_URL = String(process.env.VITE_LLM_API_URL ?? "").trim();
const ENABLE_LLM_DEV_PROXY = VITE_LLM_API_URL.startsWith("/llm") && !!LLM_UPSTREAM;

const VITE_API_BASE_URL = String(process.env.VITE_API_BASE_URL ?? "").trim();
const ENABLE_API_DEV_PROXY = !VITE_API_BASE_URL || VITE_API_BASE_URL.startsWith("/api");

// https://vite.dev/config/
export default defineConfig(async () => {
  const API_PROXY_TARGET = ENABLE_API_DEV_PROXY ? await resolveApiProxyTarget() : "";
  const ENABLED = ENABLE_API_DEV_PROXY && !!API_PROXY_TARGET;

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          workbench: resolve(__dirname, "workbench.html"),
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: (() => {
        const proxy = {};
        if (ENABLE_LLM_DEV_PROXY) {
          // Browser -> Vite (same-origin) -> RunPod (server-side), avoids CORS.
          proxy["/llm"] = {
            target: LLM_UPSTREAM,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/llm/, ""),
          };
        }
        if (ENABLED) {
          // Browser -> Vite (same-origin) -> FastAPI (server-side), avoids CORS.
          proxy["/api"] = {
            target: API_PROXY_TARGET,
            changeOrigin: true,
            secure: false,
          };
        }
        return Object.keys(proxy).length ? proxy : undefined;
      })(),
    },
  };
});
