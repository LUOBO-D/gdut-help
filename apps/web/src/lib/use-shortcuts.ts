import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ME, TABS } from '../app/nav';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * 电脑端全局快捷键（输入框聚焦或打开弹窗时自动静默）：
 * - 1–5 切换五个主标签页
 * - 0 前往「我的」
 * - N 快捷新建待办
 */
export function useAppShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key >= '1' && e.key <= String(TABS.length)) {
        const tab = TABS[Number(e.key) - 1];
        if (tab) {
          e.preventDefault();
          void navigate(tab.to);
        }
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        void navigate(ME.to);
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        void navigate('/todo?new=1');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
