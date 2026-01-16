import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  server: {
    port: 5174,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        modifyVars: {
          // 可以在这里自定义 Ant Design 主题变量
          // '@primary-color': '#1DA57A',
        },
      },
    },
  },
});
