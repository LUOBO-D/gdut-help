import {
  DEFAULT_CAMPUS_ID,
  defaultSemesterCode,
  parseElectiveCatalog,
  type CatalogImportResult,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { connectGdutAuth, GdutAuthRequired } from '../../lib/gdut-auth';
import { jwElectiveCatalogPayload, jwSemesters } from '../../lib/jw';
import { isNative } from '../../lib/platform';
import { keys } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

interface ElectiveCatalogSyncSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 全校公共选修课 & 体育选课目录同步弹窗：
 * - 安卓端支持复用「我的 → 广工统一认证」一键直连教务抓当学期全校公选/体育课目录；
 * - 全端支持直接粘贴从教务处/选课网页复制的选课目录表格，自动筛选公选课与体育选课幂等入库，不覆盖已有评价。
 */
export function ElectiveCatalogSyncSheet({ open, onClose }: ElectiveCatalogSyncSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="同步全校公选 / 体育课目录">
      {open && <ElectiveCatalogSyncBody onClose={onClose} />}
    </Sheet>
  );
}

function ElectiveCatalogSyncBody({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const userCampus = useAuth((s) => s.user?.campusId ?? DEFAULT_CAMPUS_ID);
  const [raw, setRaw] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullHint, setPullHint] = useState<string | null>(null);

  const parsed = parseElectiveCatalog(raw, { defaultCampusId: userCampus, assumeElective: true });
  const peCount = parsed.filter((i) => i.category === 'pe').length;
  const pubCount = parsed.length - peCount;

  const uploadMutation = useMutation({
    mutationFn: (items: typeof parsed) =>
      api<CatalogImportResult>('/course-reviews/catalog/import', {
        method: 'POST',
        body: { items },
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: keys.sharedCoursesPrefix });
      toast.success(`目录已同步全校：新增 ${res.added} 门、补全 ${res.updated} 门（保留全部已有评价）`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '导入目录失败'),
  });

  const handleNativeSync = async () => {
    if (!isNative) return;
    setPulling(true);
    setPullHint(null);

    const run = async () => {
      const semInfo = await jwSemesters();
      const semCode = semInfo.current?.code ?? defaultSemesterCode();
      return jwElectiveCatalogPayload(semCode);
    };

    try {
      let payload: { raw: string; assumeElective: boolean };
      try {
        payload = await run();
      } catch (err) {
        if (err instanceof GdutAuthRequired) {
          const ok = await connectGdutAuth();
          if (!ok) {
            setPullHint('已取消广工统一认证');
            return;
          }
          payload = await run();
        } else {
          throw err;
        }
      }

      const items = parseElectiveCatalog(payload.raw, {
        defaultCampusId: userCampus,
        assumeElective: payload.assumeElective,
      });

      if (items.length === 0) {
        setPullHint('当前教务选课/全校开课查询入口未开放或返回为空，可在电脑端复制选课表贴到下方一键导入');
        return;
      }

      await uploadMutation.mutateAsync(items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '抓取教务公选课目录失败，可改用下方粘贴导入';
      setPullHint(msg);
      toast.error(msg);
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="space-y-5 pb-2">
      {isNative && (
        <section className="surface-subtle space-y-2.5 rounded-2xl p-4">
          <p className="text-sm font-semibold">方式一：走「广工统一认证」一键直抓教务</p>
          <p className="text-xs leading-relaxed text-fg-muted">
            复用你在「我的」登录过的统一认证会话，自动探测教务公选课与全校开课目录，抓取后一次性写入全校共享库，其他同学无需重复抓。
          </p>
          <Button
            className="w-full"
            loading={pulling || uploadMutation.isPending}
            onClick={() => void handleNativeSync()}
          >
            一键抓取教务公选 / 体育课目录
          </Button>
          {pullHint && <p className="text-xs text-amber-600 dark:text-amber-400">{pullHint}</p>}
        </section>
      )}

      <section className="space-y-2.5">
        <p className="text-sm font-semibold">
          {isNative ? '方式二：粘贴教务选课表格批量导入' : '粘贴教务公选课 / 体育选课表格一键导入'}
        </p>
        <p className="text-xs leading-relaxed text-fg-muted">
          支持直接从广工教务选课页、全校开课查询或教务处《通识选修课选课目录》Excel 复制粘贴（含课程名、任课教师、学分、校区），重复同步自动去重且绝不覆盖同学评价。
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={'课程名称\t任课教师\t学分\t类别\t校区\n岭南衣裳\t李教授\t2\t公共选修课\t大学城校区\n体育（羽毛球）\t王教练\t1\t体育选课\t大学城校区'}
          className="surface-subtle w-full rounded-2xl p-3 text-xs outline-none placeholder:text-fg-muted/70"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">
            {raw.trim()
              ? parsed.length > 0
                ? `已识别 ${parsed.length} 门（公共选修 ${pubCount} · 体育 ${peCount}）`
                : '暂未识别到有效课程，请确认每行至少含课程名和教师'
              : '单次最多支持导入 1500 门选修课'}
          </span>
          <Button
            className="h-9 px-4 text-xs"
            disabled={parsed.length === 0}
            loading={uploadMutation.isPending}
            onClick={() => uploadMutation.mutate(parsed)}
          >
            导入共享库 {parsed.length > 0 ? `(${parsed.length})` : ''}
          </Button>
        </div>
      </section>
    </div>
  );
}
