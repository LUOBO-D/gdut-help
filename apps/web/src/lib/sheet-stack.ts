/**
 * 弹层（Sheet）全局栈：
 * 供安卓硬件返回键与浏览器返回手势优先关闭最顶层弹层，避免直接退出页面或 App。
 */

type CloseHandler = () => void;

const stack: CloseHandler[] = [];

export function pushSheet(close: CloseHandler): () => void {
  stack.push(close);
  return () => {
    const idx = stack.lastIndexOf(close);
    if (idx >= 0) stack.splice(idx, 1);
  };
}

/** 若存在已打开的弹层，关闭最顶层一个并返回 true */
export function closeTopSheet(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top();
  return true;
}

export function hasOpenSheet(): boolean {
  return stack.length > 0;
}
