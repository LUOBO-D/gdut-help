import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  current: ToastItem | null;
  show: (message: string, tone?: ToastTone) => void;
  dismiss: () => void;
}

let seq = 0;
let timer: number | undefined;

export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (message, tone = 'info') => {
    if (timer !== undefined) window.clearTimeout(timer);
    const id = ++seq;
    set({ current: { id, message, tone } });
    timer = window.setTimeout(() => {
      set((s) => (s.current?.id === id ? { current: null } : s));
    }, tone === 'error' ? 3200 : 2400);
  },
  dismiss: () => {
    if (timer !== undefined) window.clearTimeout(timer);
    set({ current: null });
  },
}));

export const toast = {
  info: (message: string) => useToastStore.getState().show(message, 'info'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  error: (message: string) => useToastStore.getState().show(message, 'error'),
};
