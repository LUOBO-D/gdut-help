import { CAMPUSES } from '@gduthelp/shared';
import { Chip } from '../../components/Field';
import { GlassCard } from '../../components/GlassCard';
import { useAuth } from '../../lib/auth-store';
import { useUpdateProfile } from './useUpdateProfile';

export function CampusPicker() {
  const campusId = useAuth((s) => s.user?.campusId);
  const update = useUpdateProfile();
  return (
    <GlassCard className="p-5">
      <h2 className="text-[15px] font-semibold">我的校区</h2>
      <p className="mt-1 text-sm text-fg-muted">决定天气查询地点和课表的节次时间</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CAMPUSES.map((c) => (
          <Chip key={c.id} active={campusId === c.id} onClick={() => update.mutate({ campusId: c.id })}>
            {c.name}
          </Chip>
        ))}
      </div>
      {update.isError && <p className="mt-2 text-sm text-danger">保存失败，请稍后再试</p>}
    </GlassCard>
  );
}
