import {
  DEFAULT_SELECTION_LEADS,
  GDUT_SELECTION_TEMPLATES,
  parseJwSelectionWindows,
  SELECTION_KIND_LABELS,
  SELECTION_KINDS,
  SELECTION_LEAD_OPTIONS,
  selectionCountdownText,
  selectionStatus,
  type CourseSelectionInput,
  type CourseSelectionReminder,
  type SelectionKind,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { ExternalLinkIcon, PlusIcon } from '../../components/icons';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { jwSelectionWindowsPayload, JwLoginRequired, loginToJw, openJwSelectionPage } from '../../lib/jw';
import { isNative } from '../../lib/platform';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bj.getUTCDate()).padStart(2, '0');
  const hh = String(bj.getUTCHours()).padStart(2, '0');
  const mm = String(bj.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function fromLocalDatetimeInput(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const iso = `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+08:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

function defaultStartInput(hhmm = '12:30'): string {
  const tomorrow = new Date(Date.now() + 24 * 3600_000 + 8 * 3600_000);
  const y = tomorrow.getUTCFullYear();
  const m = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${hhmm}`;
}

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const m = bj.getUTCMonth() + 1;
  const day = bj.getUTCDate();
  const hh = String(bj.getUTCHours()).padStart(2, '0');
  const mm = String(bj.getUTCMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

interface CourseSelectionSheetProps {
  open: boolean;
  items: CourseSelectionReminder[];
  now: Date;
  onClose: () => void;
}

/**
 * 选课时间提醒管理抽屉：
 * 支持一键探测教务选课时间、套用广工常见选课模板、配置多档提前通知（1天/1小时/30分/10分/5分），
 * 保存后自动写入安卓本地推送闹钟与首页倒计时提醒条。
 */
export function CourseSelectionSheet({ open, items, now, onClose }: CourseSelectionSheetProps) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<CourseSelectionReminder | null>(null);
  const [syncingJw, setSyncingJw] = useState(false);

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<SelectionKind>('elective');
  const [startLocal, setStartLocal] = useState(() => defaultStartInput());
  const [endLocal, setEndLocal] = useState('');
  const [leads, setLeads] = useState<number[]>([...DEFAULT_SELECTION_LEADS]);
  const [note, setNote] = useState('');

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setKind('elective');
    setStartLocal(defaultStartInput('12:30'));
    setEndLocal('');
    setLeads([...DEFAULT_SELECTION_LEADS]);
    setNote('');
    setMode('form');
  };

  const openEdit = (item: CourseSelectionReminder) => {
    setEditing(item);
    setTitle(item.title);
    setKind(item.kind);
    setStartLocal(toLocalDatetimeInput(item.startAt));
    setEndLocal(item.endAt ? toLocalDatetimeInput(item.endAt) : '');
    setLeads(item.leadMinutes.length ? [...item.leadMinutes] : [...DEFAULT_SELECTION_LEADS]);
    setNote(item.note ?? '');
    setMode('form');
  };

  const applyTemplate = (tpl: (typeof GDUT_SELECTION_TEMPLATES)[number]) => {
    setTitle(tpl.title);
    setKind(tpl.kind);
    setStartLocal(defaultStartInput(tpl.defaultTime));
    setNote(tpl.note);
  };

  const toggleLead = (m: number) => {
    setLeads((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => b - a)));
  };

  const saveMutation = useMutation({
    mutationFn: (body: CourseSelectionInput) =>
      editing
        ? api<CourseSelectionReminder>(`/course-selections/${editing.id}`, { method: 'PUT', body })
        : api<CourseSelectionReminder>('/course-selections', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.courseSelections });
      toast.success(editing ? '已更新选课提醒' : '已添加选课提醒，将在开抢前自动通知');
      setMode('list');
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '保存失败'),
  });

  const toggleMutation = useMutation({
    mutationFn: (item: CourseSelectionReminder) =>
      api<CourseSelectionReminder>(`/course-selections/${item.id}`, {
        method: 'PUT',
        body: {
          title: item.title,
          kind: item.kind,
          startAt: item.startAt,
          endAt: item.endAt,
          enabled: !item.enabled,
          leadMinutes: item.leadMinutes,
          note: item.note,
          source: item.source,
        },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.courseSelections }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/course-selections/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.courseSelections });
      toast.success('已删除该选课提醒');
      setMode('list');
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '删除失败'),
  });

  const handleSyncJw = async () => {
    if (!isNative) return;
    setSyncingJw(true);
    try {
      let raw = await jwSelectionWindowsPayload();
      if (!raw) {
        const ok = await loginToJw();
        if (ok) raw = await jwSelectionWindowsPayload();
      }
      const parsed = parseJwSelectionWindows(raw);
      if (parsed.length === 0) {
        toast.info('当前不在教务选课开放期，可先按教务通知手动添加抢课提醒');
        return;
      }
      const res = await api<{ added: number; total: number }>('/course-selections/sync', {
        method: 'POST',
        body: {
          items: parsed.map((p) => ({
            ...p,
            enabled: true,
            leadMinutes: [...DEFAULT_SELECTION_LEADS],
            source: 'jw' as const,
          })),
        },
      });
      void qc.invalidateQueries({ queryKey: keys.courseSelections });
      toast.success(res.added > 0 ? `已从教务同步 ${res.added} 条选课时间` : '教务选课时间已是最新');
    } catch (err) {
      if (err instanceof JwLoginRequired) {
        toast.info('请先完成广工统一认证后再同步');
      } else {
        toast.error(err instanceof Error ? err.message : '探测教务选课时间失败');
      }
    } finally {
      setSyncingJw(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const startAt = fromLocalDatetimeInput(startLocal);
    if (!startAt) {
      toast.error('请选择有效的开始时间');
      return;
    }
    const endAt = endLocal.trim() ? fromLocalDatetimeInput(endLocal) : null;
    if (endAt && new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      toast.error('结束时间需晚于开始时间');
      return;
    }
    saveMutation.mutate({
      title: title.trim() || SELECTION_KIND_LABELS[kind],
      kind,
      startAt,
      endAt,
      enabled: editing?.enabled ?? true,
      leadMinutes: leads.length ? leads : [30, 5],
      note: note.trim() || null,
      source: editing?.source ?? 'manual',
    });
  };

  const handleClose = () => {
    setMode('list');
    setEditing(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={mode === 'form' ? (editing ? '编辑选课提醒' : '新建选课提醒') : '选课时间提醒'}
    >
      {mode === 'list' ? (
        <div className="space-y-3.5 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-9 flex-1 gap-1 text-xs" onClick={openCreate}>
              <PlusIcon size={14} />
              添加选课时间
            </Button>
            {isNative && (
              <>
                <Button variant="ghost" className="h-9 px-3 text-xs" loading={syncingJw} onClick={() => void handleSyncJw()}>
                  同步教务
                </Button>
                <Button variant="ghost" className="h-9 gap-1 px-3 text-xs" onClick={() => void openJwSelectionPage()}>
                  <ExternalLinkIcon size={13} />
                  去选课
                </Button>
              </>
            )}
          </div>

          {items.length === 0 ? (
            <div className="surface-subtle space-y-2 rounded-2xl p-4 text-center">
              <p className="text-sm font-medium">还没有设置选课提醒</p>
              <p className="text-xs leading-relaxed text-fg-muted">
                录入正选/公选/体育抢课时间后，首页会展示倒计时，{isNative ? '手机端还会在开抢前准点推送本地通知。' : '不错过每一次抢课窗口。'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const status = selectionStatus(item, now);
                const countdown = selectionCountdownText(item, now);
                return (
                  <div
                    key={item.id}
                    className={`surface-subtle flex items-start justify-between gap-3 rounded-2xl p-3.5 ${
                      status === 'ended' || !item.enabled ? 'opacity-60' : ''
                    }`}
                  >
                    <button type="button" onClick={() => openEdit(item)} className="min-w-0 flex-1 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{item.title}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            status === 'ongoing'
                              ? 'bg-emerald-500/18 text-emerald-600 dark:text-emerald-300'
                              : status === 'upcoming'
                                ? 'bg-accent/15 text-accent'
                                : 'bg-current/10 text-fg-muted'
                          }`}
                        >
                          {countdown}
                        </span>
                      </div>
                      <p className="mt-1 font-num text-xs text-fg-muted tabular-nums">
                        {formatShortTime(item.startAt)}
                        {item.endAt ? ` – ${formatShortTime(item.endAt)}` : ''}
                        {' · '}
                        {SELECTION_KIND_LABELS[item.kind]}
                      </p>
                      {item.leadMinutes.length > 0 && status === 'upcoming' && (
                        <p className="mt-1 text-[11px] text-fg-muted">
                          提前提醒：
                          {item.leadMinutes
                            .map((m) => (m >= 1440 ? `${Math.round(m / 1440)}天` : m >= 60 ? `${Math.round(m / 60)}小时` : `${m}分`))
                            .join(' / ')}
                        </p>
                      )}
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.enabled}
                      aria-label={`切换${item.title}提醒`}
                      onClick={() => toggleMutation.mutate(item)}
                      className={`mt-0.5 h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors ${
                        item.enabled ? 'bg-accent' : 'bg-current/20'
                      }`}
                    >
                      <span
                        className={`block size-5 rounded-full bg-white shadow-sm transition-transform ${
                          item.enabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5 pb-2">
          {!editing && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-fg-muted">快速套用广工常见选课轮次</p>
              <div className="flex flex-wrap gap-1.5">
                {GDUT_SELECTION_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="surface-subtle surface-subtle-hover rounded-full px-2.5 py-1 text-xs font-medium"
                  >
                    {tpl.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label="选课轮次名称">
            <input
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：公共选修课正选（抢课）"
              required
            />
          </Field>

          <div className="flex flex-wrap gap-1.5">
            {SELECTION_KINDS.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)} className="text-xs">
                {SELECTION_KIND_LABELS[k]}
              </Chip>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="开始时间">
              <input
                type="datetime-local"
                className="field font-num"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                required
              />
            </Field>
            <Field label="结束时间（选填）">
              <input
                type="datetime-local"
                className="field font-num"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-fg-muted">开抢前自动通知（可多选）</p>
            <div className="flex flex-wrap gap-1.5">
              {SELECTION_LEAD_OPTIONS.map((opt) => (
                <Chip
                  key={opt.minutes}
                  active={leads.includes(opt.minutes)}
                  onClick={() => toggleLead(opt.minutes)}
                  className="text-xs"
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </div>

          <Field label="备忘（选填）">
            <input
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="如：备好心仪公选课号、提前 5 分钟登教务"
              maxLength={160}
            />
          </Field>

          <div className="flex items-center gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setMode('list')}>
              返回
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(editing.id)}
              >
                删除
              </Button>
            )}
            <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
              保存提醒
            </Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
