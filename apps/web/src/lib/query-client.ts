import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // 离线持久化：缓存保留 7 天，打开应用时先显示上次的数据
      gcTime: 7 * 24 * 3600_000,
      // 4xx 是确定的业务结果，不重试；网络错误和 5xx 最多重试 2 次
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
    mutations: {
      // 离线时立刻失败并提示，而不是无限期挂起
      networkMode: 'always',
    },
  },
});

/** 把查询缓存存到 IndexedDB，离线时也能看到天气、课表、待办 */
export const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'gduthelp-query-cache',
  throttleTime: 2000,
});

/** 缓存结构变化时改这个值，旧缓存会被丢弃 */
export const CACHE_BUSTER = 's2-1';

/** 退出登录时清空内存和本地缓存，避免下一个账号看到上一个人的数据 */
export async function clearQueryCache() {
  queryClient.clear();
  await persister.removeClient();
}
