import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      // Optional dev proxy to billynewmanphoto.com before bnp-cors.htaccess is live
      '/bnp-proxy': {
        target: 'https://billynewmanphoto.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bnp-proxy/, ''),
      },
    },
  },
});
