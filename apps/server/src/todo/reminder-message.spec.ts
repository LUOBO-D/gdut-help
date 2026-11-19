import { formatRemaining, formatWhen, reminderBody } from './reminder-message.js';

// 北京时间 2026-11-20（周五）14:00
const now = new Date('2026-11-20T06:00:00Z');

describe('提醒文案', () => {
  it('按北京时间显示今天/明天/具体日期', () => {
    expect(formatWhen(new Date('2026-11-20T15:59:00Z'), now)).toBe('今天 23:59');
    expect(formatWhen(new Date('2026-11-21T00:00:00Z'), now)).toBe('明天 08:00');
    expect(formatWhen(new Date('2026-11-24T02:00:00Z'), now)).toMatch(/11\/24.*10:00/);
  });

  it('剩余时间', () => {
    expect(formatRemaining(new Date(now.getTime() + 45 * 60_000), now)).toBe('还有 45 分钟');
    expect(formatRemaining(new Date(now.getTime() + 80 * 60_000), now)).toBe('还有 1 小时 20 分');
    expect(formatRemaining(new Date(now.getTime() - 5 * 60_000), now)).toBe('已超时 5 分钟');
  });

  it('迟到超过 5 分钟时注明', () => {
    expect(reminderBody(null, now, 0)).toBe('提醒时间到了');
    expect(reminderBody(null, now, 30)).toContain('晚了 30 分钟');
    expect(reminderBody(new Date(now.getTime() + 3600_000), now, 2)).toBe('截止 今天 15:00，还有 1 小时');
  });
});
