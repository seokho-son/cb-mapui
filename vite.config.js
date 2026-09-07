import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  base: './',
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    {
      name: 'copy-static-assets',
      closeBundle() {
        const copyFile = (src, dest) => {
          const s = resolve(__dirname, src);
          const d = resolve(__dirname, dest);
          if (fs.existsSync(s)) {
            fs.copyFileSync(s, d);
          }
        };
        const copyDir = (src, dest) => {
          const s = resolve(__dirname, src);
          const d = resolve(__dirname, dest);
          if (fs.existsSync(s)) {
            fs.mkdirSync(d, { recursive: true });
            fs.cpSync(s, d, { recursive: true });
          }
        };

        // Copy static assets to dist/
        copyDir('img', 'dist/img');
        copyFile('dashboard.html', 'dist/dashboard.html');
        copyFile('dashboard.js', 'dist/dashboard.js');
        copyFile('swagger.html', 'dist/swagger.html');
        copyFile('redoc-swagger.html', 'dist/redoc-swagger.html');
        copyFile('scalar.html', 'dist/scalar.html');
        copyFile('runtime-params.json', 'dist/runtime-params.json');
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 1324,
  },
  preview: {
    host: '0.0.0.0',
    port: 1324,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
  },
});

