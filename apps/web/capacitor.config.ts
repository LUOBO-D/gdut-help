import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 安卓 App 配置。页面文件打包进安装包（dist），从 https://localhost 加载；
 * API 地址在打包时由 .env.android.local 里的 VITE_API_ORIGIN 指定。
 */
const config: CapacitorConfig = {
  appId: 'io.github.luobod.gduthelp',
  appName: 'GDUT Help',
  webDir: 'dist',
  android: {
    // 只允许 HTTPS，不加载明文 http 内容；生产构建禁止 WebView 远程调试
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#ff9a76',
    },
    // 完全自托管热更新模式：关闭 Capgo 云端自动检查与统计上报，由 src/lib/ota-updater.ts 请求自有后端
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      appReadyTimeout: 10000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      resetWhenUpdate: true,
    },
  },
};

export default config;
