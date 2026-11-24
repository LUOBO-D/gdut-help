import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNativeTokenForTest,
  getRefreshToken,
  getTokenStorageStatus,
  setRefreshToken,
  type SecureTokenBridge,
} from './native-token';

/**
 * 模拟 Capacitor registerPlugin() 返回的 ES6 Proxy：
 * 任何未知属性访问（尤其是 `.then`）都会被拦截为返回一个永不 resolve 的原生调用函数，
 * 用来回归验证 native-token 绝不会让 Promise 直接 resolve 成插件 Proxy。
 */
function createCapacitorLikeProxy(impl: Partial<SecureTokenBridge>): SecureTokenBridge {
  const thenSpy = vi.fn(() => new Promise(() => undefined));
  return new Proxy(impl as SecureTokenBridge, {
    get(target, prop) {
      if (prop === 'then') return thenSpy;
      return Reflect.get(target, prop);
    },
  });
}

describe('native-token Capacitor Proxy safety', () => {
  afterEach(() => {
    __resetNativeTokenForTest(null);
  });

  it('resolves get/set/status cleanly without triggering Proxy.then deadlock', async () => {
    const store = new Map<string, string>();
    const proxy = createCapacitorLikeProxy({
      get: async ({ key }) => ({ value: store.get(key) ?? null, encrypted: true }),
      set: async ({ key, value }) => {
        store.set(key, value);
        return { ok: true, encrypted: true };
      },
      remove: async ({ key }) => {
        store.delete(key);
        return { ok: true };
      },
      status: async () => ({ available: true, hardwareBacked: true, algorithm: 'AES-256-GCM / AndroidKeyStore' }),
    });

    __resetNativeTokenForTest(Promise.resolve({ plugin: proxy }));

    await setRefreshToken('rt_secret_123');
    expect(await getRefreshToken()).toBe('rt_secret_123');

    const status = await getTokenStorageStatus();
    expect(status.hardwareBacked).toBe(true);

    await setRefreshToken(null);
    expect(await getRefreshToken()).toBeNull();
  });
});
