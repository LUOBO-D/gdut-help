import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const api = { '/api': { target: 'http://127.0.0.1:3000' } };

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 自己写 Service Worker（src/sw.ts），因为需要处理推送和通知点击
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        // three.js 分包约 1MB，也预缓存，离线时 3D 天空照常显示
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      // 开发服务器也启用，方便测试推送
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
      manifest: {
        name: 'GDUT Help · 广工校园生活助手',
        short_name: 'GDUT Help',
        description: '天气、课表、待办提醒',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ff9a76',
        theme_color: '#ffb57a',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // 手机通过 `tailscale serve` 访问时，Host 是 <机器名>.<tailnet>.ts.net
    allowedHosts: ['.ts.net'],
    proxy: api,
  },
  preview: { allowedHosts: ['.ts.net'], proxy: api },
});
