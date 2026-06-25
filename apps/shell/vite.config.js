import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: appDir,
  resolve: {
    alias: {
      "@shared": path.resolve(appDir, "../../packages/shared/src"),
      "@ui": path.resolve(appDir, "../../packages/ui/src")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: true,
    allowedHosts: ["127.0.0.1", "localhost", "host.docker.internal"]
  },
  preview: {
    host: "127.0.0.1",
    port: 8765,
    strictPort: true
  },
  build: {
    outDir: path.resolve(appDir, "../../dist/shell"),
    emptyOutDir: true,
    target: "esnext",
    modulePreload: false
  }
});
