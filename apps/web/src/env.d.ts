interface ImportMetaEnv {
  /** 安卓 App 访问的 API 地址（不带 /api/v1），例如 https://<机器名>.<tailnet>.ts.net。只在 App 打包时使用 */
  readonly VITE_API_ORIGIN?: string;
  /** 安卓 App / OTA 热更新包的前端语义化版本（如 0.2.0） */
  readonly VITE_APP_VERSION?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
