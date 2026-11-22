import { describe, expect, it } from 'vitest';
import { parseQuickTodo } from './todo-parser.js';

// 固定北京时间：2026-11-23（周一）14:00:00 +08:00
const NOW = new Date('2026-11-23T14:00:00+08:00');

describe('parseQuickTodo', () => {
  it('解析「明晚8点交高数作业」', () => {
    const res = parseQuickTodo('明晚8点交高数作业', NOW);
    expect(res.title).toBe('交高数作业');
    expect(res.repeat).toBe('none');
    expect(res.dueAt).toBe(new Date('2026-11-24T20:00:00+08:00').toISOString());
    expect(res.label).toContain('明天');
    expect(res.label).toContain('20:00');
  });

  it('解析「周五前交实验报告」为本周五 22:00', () => {
    const res = parseQuickTodo('周五前交实验报告', NOW);
    expect(res.title).toBe('交实验报告');
    expect(res.repeat).toBe('none');
    expect(res.dueAt).toBe(new Date('2026-11-27T22:00:00+08:00').toISOString());
  });

  it('解析「每周五提交实验室周报」为周重复', () => {
    const res = parseQuickTodo('每周五提交实验室周报', NOW);
    expect(res.title).toBe('提交实验室周报');
    expect(res.repeat).toBe('weekly');
    expect(res.dueAt).toBe(new Date('2026-11-27T22:00:00+08:00').toISOString());
    expect(res.label).toContain('每周');
  });

  it('解析「每天早上8点半背单词」且今天 08:30 已过时顺延到明天', () => {
    const res = parseQuickTodo('每天早上8点半背单词', NOW);
    expect(res.title).toBe('背单词');
    expect(res.repeat).toBe('daily');
    expect(res.dueAt).toBe(new Date('2026-11-24T08:30:00+08:00').toISOString());
  });

  it('解析「下周二下午3:30开组会」', () => {
    const res = parseQuickTodo('下周二下午3:30开组会', NOW);
    expect(res.title).toBe('开组会');
    expect(res.repeat).toBe('none');
    expect(res.dueAt).toBe(new Date('2026-12-01T15:30:00+08:00').toISOString());
  });

  it('不误判含数字的纯文本标题', () => {
    const res = parseQuickTodo('复习高数第3章习题', NOW);
    expect(res.title).toBe('复习高数第3章习题');
    expect(res.dueAt).toBeNull();
    expect(res.repeat).toBe('none');
    expect(res.label).toBeNull();
  });
});
