import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearDismissedOtaVersion,
  getDismissedOtaVersion,
  useOtaStore,
  type PendingOtaUpdate,
} from './ota-store';

const sampleUpdate: PendingOtaUpdate = {
  currentVersion: '0.3.1',
  downloadUrl: 'https://youhelp.top/api/v1/app/bundles/bundle-0.3.2.zip',
  apkUrl: 'https://youhelp.top/api/v1/app/apk/latest',
  needsNativeUpgrade: false,
  latest: {
    version: '0.3.2',
    minNativeVersion: 4,
    notes: '1. 新增更新说明弹窗\n2. 支持自主选择更新',
    file: 'bundle-0.3.2.zip',
    sha256: 'a'.repeat(64),
    sizeBytes: 850_000,
    publishedAt: '2026-11-22T06:00:00.000Z',
  },
};

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

describe('useOtaStore', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createMemoryStorage() },
      configurable: true,
      writable: true,
    });
    useOtaStore.getState().reset();
    clearDismissedOtaVersion();
  });

  afterEach(() => {
    useOtaStore.getState().reset();
  });

  it('opens update prompt and persists dismissed version when user defers', () => {
    useOtaStore.getState().setAvailable(sampleUpdate, { openModal: true });
    expect(useOtaStore.getState().open).toBe(true);
    expect(useOtaStore.getState().available?.latest.version).toBe('0.3.2');

    useOtaStore.getState().dismissCurrent();
    expect(useOtaStore.getState().open).toBe(false);
    // 仍保留 available，方便用户在「我的」页重新点开升级
    expect(useOtaStore.getState().available?.latest.version).toBe('0.3.2');
    expect(getDismissedOtaVersion()).toBe('0.3.2');

    // 用户主动重开
    useOtaStore.getState().openModal();
    expect(useOtaStore.getState().open).toBe(true);
  });

  it('prevents dismissing while downloading or applying', () => {
    useOtaStore.getState().setAvailable(sampleUpdate, { openModal: true });
    useOtaStore.getState().setPhase('downloading', { progress: 42 });

    useOtaStore.getState().dismissCurrent();
    useOtaStore.getState().closeModal();
    expect(useOtaStore.getState().open).toBe(true);
    expect(useOtaStore.getState().progress).toBe(42);
    expect(getDismissedOtaVersion()).toBeNull();
  });

  it('prevents dismissing or closing when forceUpgrade is active', () => {
    useOtaStore.getState().setAvailable({ ...sampleUpdate, needsNativeUpgrade: true, forceUpgrade: true });
    expect(useOtaStore.getState().open).toBe(true);

    useOtaStore.getState().dismissCurrent();
    useOtaStore.getState().closeModal();
    expect(useOtaStore.getState().open).toBe(true);
    expect(getDismissedOtaVersion()).toBeNull();
  });
});
