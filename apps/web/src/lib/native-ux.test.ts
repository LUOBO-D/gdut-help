import { describe, expect, it } from 'vitest';
import { resolveNativeBackAction } from './native-ux';

describe('resolveNativeBackAction', () => {
  it('returns to login when guest enters /map from /login', () => {
    expect(
      resolveNativeBackAction({
        pathname: '/map',
        isAuthenticated: false,
        fromLogin: true,
        canGoBack: true,
        historyIdx: 1,
      }),
    ).toEqual({ kind: 'back' });
  });

  it('still replaces to /login when guest on /map has no webview history', () => {
    expect(
      resolveNativeBackAction({
        pathname: '/map',
        isAuthenticated: false,
        fromLogin: true,
        canGoBack: false,
        historyIdx: 0,
      }),
    ).toEqual({ kind: 'replace', to: '/login' });

    expect(
      resolveNativeBackAction({
        pathname: '/map',
        isAuthenticated: false,
        fromLogin: false,
        canGoBack: true,
        historyIdx: 2,
      }),
    ).toEqual({ kind: 'replace', to: '/login' });
  });

  it('prompts double-back exit only on / and /login', () => {
    expect(resolveNativeBackAction({ pathname: '/login', isAuthenticated: false, canGoBack: false })).toEqual({
      kind: 'exit-prompt',
    });
    expect(resolveNativeBackAction({ pathname: '/', isAuthenticated: true, canGoBack: false })).toEqual({
      kind: 'exit-prompt',
    });
  });

  it('navigates back or falls back to home on authenticated inner pages', () => {
    expect(
      resolveNativeBackAction({ pathname: '/map', isAuthenticated: true, canGoBack: true, historyIdx: 2 }),
    ).toEqual({ kind: 'back' });
    expect(
      resolveNativeBackAction({ pathname: '/timetable', isAuthenticated: true, canGoBack: false, historyIdx: 0 }),
    ).toEqual({ kind: 'replace', to: '/' });
  });
});
