import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { copyFileSync, mkdirSync } from 'fs'

export default defineConfig({
  publicDir: 'public',
  plugins: [
    react(),
    // 自定义插件：复制esbuild-wasm文件
    {
      name: 'copy-esbuild-wasm',
      generateBundle() {
        // 在构建时复制WASM文件
        try {
          mkdirSync(path.resolve(__dirname, 'dist/node_modules/esbuild-wasm'), { recursive: true });
          copyFileSync(
            path.resolve(__dirname, 'node_modules/esbuild-wasm/esbuild.wasm'),
            path.resolve(__dirname, 'dist/node_modules/esbuild-wasm/esbuild.wasm')
          );
          copyFileSync(
            path.resolve(__dirname, 'node_modules/esbuild-wasm/esbuild.wasm'),
            path.resolve(__dirname, 'dist/esbuild.wasm')
          );
          console.log('✓ esbuild.wasm files copied to dist');
        } catch (error) {
          console.warn('⚠️ Failed to copy esbuild.wasm files:', error);
        }
      }
    }
  ],
  envDir: path.resolve(__dirname, '..'), // 指向 app 目录
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: process.env.VITE_HOST || '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '3000'),
    open: true,
    allowedHosts: ['demo.teea.cn'],
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      external: [],
    },
    // 确保Service Worker和manifest文件被复制
    copyPublicDir: true,
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['esbuild-wasm']
  },

})