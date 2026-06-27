import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

function utf8TextHeaders() {
  const apply = (server) => {
    server.middlewares.use((req, res, next) => {
      const end = res.end;
      res.end = function patchedEnd(...args) {
        const contentType = res.getHeader("Content-Type");
        if (typeof contentType === "string" && /^(text\/html|text\/css|text\/javascript|application\/javascript)/i.test(contentType) && !/charset=/i.test(contentType)) {
          res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
        }
        return end.apply(this, args);
      };
      next();
    });
  };
  return {
    name: "matrix-utf8-text-headers",
    configureServer: apply,
    configurePreviewServer: apply
  };
}

export default defineConfig({
  root: appDir,
  plugins: [utf8TextHeaders()],
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
