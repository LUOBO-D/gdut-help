import { describe, expect, it } from 'vitest';
import { compareSemver, formatBundleSize, parseReleaseNotes } from './app-update.js';

describe('app-update helpers', () => {
  it('compares semver strings accurately', () => {
    expect(compareSemver('0.3.2', '0.3.1')).toBeGreaterThan(0);
    expect(compareSemver('v1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareSemver('0.3.1', '0.3.1')).toBe(0);
    expect(compareSemver('0.3.0', '0.3.1')).toBeLessThan(0);
  });

  it('parses multiline and escaped release notes into clean items', () => {
    expect(parseReleaseNotes('1. 新增更新说明弹窗\n2. 支持自由选择更新\n- 修复已知问题')).toEqual([
      '新增更新说明弹窗',
      '支持自由选择更新',
      '修复已知问题',
    ]);
    expect(parseReleaseNotes('• 优化 3D 校园地图\\n· 提升课表加载速度\\n\\n')).toEqual([
      '优化 3D 校园地图',
      '提升课表加载速度',
    ]);
    expect(parseReleaseNotes('')).toEqual([]);
  });

  it('formats bundle sizes cleanly', () => {
    expect(formatBundleSize(undefined)).toBeNull();
    expect(formatBundleSize(0)).toBeNull();
    expect(formatBundleSize(850_000)).toBe('830 KB');
    expect(formatBundleSize(1_572_864)).toBe('1.50 MB');
  });
});
