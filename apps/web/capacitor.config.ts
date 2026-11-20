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
    // 只允许 HTTPS，不加载明文 http 内容
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#ff9a76',
    },
  },
};

export default config;
