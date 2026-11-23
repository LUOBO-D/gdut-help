import {
  CET_LEVELS,
  CET_SHORT_LABELS,
  parseCetText,
  type CetLevel,
  type CetRecord,
  type CetRecordInput,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Chip, Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export type CetDraft = { record?: CetRecord } | null;

function defaultCetSession(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m >= 8) return `${y}年6月`;
  if (m >= 2) return `${y - 1}年12月`;
  return `${y - 1}年6月`;
}

export function CetEditorSheet({ draft, onClose }: { draft: CetDraft; onClose: () => void }) {
  const editing = draft?.record;
  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title={editing ? '编辑四六级成绩' : '记录四六级成绩'}>
      {draft && <CetEditorForm key={editing?.id ?? 'new'} editing={editing} onClose={onClose} />}
    </Sheet>
  );
}

function CetEditorForm({ editing, onClose }: { editing?: CetRecord; onClose: () => void }) {
  const qc = useQueryClient();

  const [pasteText, setPasteText] = useState('');
  const [level, setLevel] = useState<CetLevel>(editing?.level ?? 'cet4');
  const [examSession, setExamSession] = useState(() => editing?.examSession ?? defaultCetSession());
  const [totalScore, setTotalScore] = useState(() => (editing ? String(editing.totalScore) : ''));
  const [listening, setListening] = useState(() => (editing?.listening != null ? String(editing.listening) : ''));
  const [reading, setReading] = useState(() => (editing?.reading != null ? String(editing.reading) : ''));
  const [writing, setWriting] = useState(() => (editing?.writing != null ? String(editing.writing) : ''));
  const [oralGrade, setOralGrade] = useState(() => editing?.oralGrade ?? '');
  const [ticketNo, setTicketNo] = useState(() => editing?.ticketNo ?? '');
  const [note] = useState(() => editing?.note ?? '');

  const handleParsePaste = () => {
    const parsed = parseCetText(pasteText);
    if (!parsed) {
      toast.info('未识别到四六级成绩，请确认包含总分或四/六级字样');
      return;
    }
    if (parsed.level) setLevel(parsed.level);
    if (parsed.examSession) setExamSession(parsed.examSession);
    if (parsed.totalScore !== undefined) setTotalScore(String(parsed.totalScore));
    if (parsed.listening !== undefined && parsed.listening !== null) setListening(String(parsed.listening));
    if (parsed.reading !== undefined && parsed.reading !== null) setReading(String(parsed.reading));
    if (parsed.writing !== undefined && parsed.writing !== null) setWriting(String(parsed.writing));
    if (parsed.oralGrade) setOralGrade(parsed.oralGrade);
    if (parsed.ticketNo) setTicketNo(parsed.ticketNo);
    toast.success('已自动识别并填入成绩');
  };

  const saveMutation = useMutation({
    mutationFn: (body: CetRecordInput) =>
      editing
        ? api<CetRecord>(`/cet/${editing.id}`, { method: 'PUT', body })
        : api<CetRecord>('/cet', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.cetRecords });
      toast.success(editing ? '已更新四六级成绩' : '已保存四六级成绩');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '保存失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/cet/${editing!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.cetRecords });
      toast.success('已删除该条记录');
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '删除失败'),
  });

  const parseIntOrNull = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = Math.round(Number(t));
    return Number.isFinite(n) ? n : null;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const l = parseIntOrNull(listening);
    const r = parseIntOrNull(reading);
    const w = parseIntOrNull(writing);
    let total = parseIntOrNull(totalScore);
    if (total === null && l !== null && r !== null && w !== null) {
      total = l + r + w;
    }
    if (total === null || total < 0 || total > 710) {
      toast.error('请填写有效的总分（0–710）');
      return;
    }
    if (!examSession.trim()) {
      toast.error('请填写考次（如 2026年6月）');
      return;
    }
    saveMutation.mutate({
      level,
      examSession: examSession.trim(),
      totalScore: total,
      listening: l,
      reading: r,
      writing: w,
      oralGrade: oralGrade.trim() || null,
      ticketNo: ticketNo.trim() || null,
      note: note.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-2">
      {!editing && (
        <div className="surface-subtle space-y-2 rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-fg-muted">粘贴官方查分文本快速识别（可选）</span>
            {pasteText.trim() && (
              <button
                type="button"
                onClick={handleParsePaste}
                className="text-xs font-semibold text-accent hover:underline"
              >
                一键识别
              </button>
            )}
          </div>
          <textarea
            rows={2}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="例如：英语四级 2026年6月 总分548 听力185 阅读205 写作和翻译158 准考证号4400..."
            className="field w-full resize-none text-xs"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        {CET_LEVELS.map((lv) => (
          <Chip key={lv} active={level === lv} onClick={() => setLevel(lv)} className="flex-1 justify-center py-2">
            {CET_SHORT_LABELS[lv]} {lv === 'cet4' ? '四级' : '六级'}
          </Chip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="考次">
          <input
            className="field"
            value={examSession}
            onChange={(e) => setExamSession(e.target.value)}
            placeholder="2026年6月"
            required
          />
        </Field>
        <Field label="总分（0–710）">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={710}
            className="field font-num"
            value={totalScore}
            onChange={(e) => setTotalScore(e.target.value)}
            placeholder="留空可由分项求和"
          />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Field label="听力">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={249}
            className="field font-num"
            value={listening}
            onChange={(e) => setListening(e.target.value)}
            placeholder="0–249"
          />
        </Field>
        <Field label="阅读">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={249}
            className="field font-num"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            placeholder="0–249"
          />
        </Field>
        <Field label="写作翻译">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={213}
            className="field font-num"
            value={writing}
            onChange={(e) => setWriting(e.target.value)}
            placeholder="0–213"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="口语等级（选填）">
          <input
            className="field"
            value={oralGrade}
            onChange={(e) => setOralGrade(e.target.value)}
            placeholder="如 A / B+ / C"
            maxLength={8}
          />
        </Field>
        <Field label="准考证号（选填）">
          <input
            className="field font-num"
            value={ticketNo}
            onChange={(e) => setTicketNo(e.target.value)}
            placeholder="方便日后核查"
            maxLength={32}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="text-danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            删除
          </Button>
        )}
        <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
          保存成绩
        </Button>
      </div>
    </form>
  );
}
