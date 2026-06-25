export default {
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        binance: "binance.html"
      }
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
    strictPort: true,
    allowedHosts: ["127.0.0.1", "localhost", "host.docker.internal"]
  }
};
