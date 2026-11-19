import type { AuthSession, UserProfile } from '@gduthelp/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  /** access token 只放内存；刷新令牌在 HttpOnly Cookie 中，JS 读不到 */
  accessToken: string | null;
  expiresAt: number;
  /** 本地保存一份资料：离线打开时没法刷新令牌，仍然可以凭它显示缓存的数据 */
  user: UserProfile | null;
  /** 当前是离线状态下用本地资料进入的 */
  offline: boolean;
  setSession: (session: AuthSession) => void;
  setUser: (user: UserProfile) => void;
  enterOffline: () => boolean;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      status: 'unknown',
      accessToken: null,
      expiresAt: 0,
      user: null,
      offline: false,
      setSession: (s) =>
        set({
          status: 'authenticated',
          accessToken: s.accessToken,
          expiresAt: Date.parse(s.expiresAt),
          user: s.user,
          offline: false,
        }),
      setUser: (user) => set({ user }),
      enterOffline: () => {
        if (!get().user) return false;
        set({ status: 'authenticated', accessToken: null, expiresAt: 0, offline: true });
        return true;
      },
      clear: () => set({ status: 'anonymous', accessToken: null, expiresAt: 0, user: null, offline: false }),
    }),
    { name: 'gduthelp-auth', partialize: ({ user }) => ({ user }) },
  ),
);
