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
    port: 8767,
    strictPort: true,
    allowedHosts: ["127.0.0.1", "localhost", "host.docker.internal"]
  },
  build: {
    outDir: path.resolve(appDir, "../../dist/dashboard"),
    emptyOutDir: true,
    target: "esnext",
    modulePreload: false
  }
});
