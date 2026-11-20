interface ImportMetaEnv {
  /** 安卓 App 访问的 API 地址（不带 /api/v1），例如 https://<机器名>.<tailnet>.ts.net。只在 App 打包时使用 */
  readonly VITE_API_ORIGIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
