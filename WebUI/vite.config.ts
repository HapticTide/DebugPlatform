import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9527',
        ws: true,
      },
      '/debug-bridge': {
        target: 'ws://localhost:9527',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 提高 chunk 大小警告阈值（包含 recharts 后合理的大小）
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 protobufjs 分离成独立 chunk
          protobuf: ['protobufjs'],
          // 将 react 相关依赖分离
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // 将状态管理分离
          zustand: ['zustand'],
          // 将 recharts 及其依赖分离成独立 chunk
          recharts: ['recharts', 'd3-scale', 'd3-shape', 'd3-path', 'd3-color', 'd3-interpolate', 'd3-format', 'd3-time', 'd3-time-format', 'd3-array'],
        },
      },
      // 忽略 protobufjs 中 eval 的警告（这是库的内部实现，无法修改）
      onwarn(warning, warn) {
        if (warning.code === 'EVAL' && warning.id?.includes('@protobufjs')) {
          return
        }
        warn(warning)
      },
    },
  },
})

