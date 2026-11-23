import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { MapIcon, NavigationIcon, SearchIcon } from '../../components/icons';
import { PageHeader } from '../../components/PageHeader';
import { spring } from '../../motion/presets';
import { CampusToolboxPanel } from './CampusToolboxPanel';
import { EmptyClassroomPanel } from './EmptyClassroomPanel';

type CampusTab = 'rooms' | 'toolbox';

const QUICK_MAP_CHIPS = ['图书馆', '一饭', '二饭', '教3', '大教室', '校医院'] as const;

function parseCampusTab(raw: string | null): CampusTab | null {
  if (raw === 'rooms' || raw === 'toolbox') return raw;
  return null;
}

/**
 * 统一「校园」空间与生活服务中心：
 * - 顶部 3D 校园地图直达横幅（搜建筑/一键进 3D 导航/常用地标秒达）；
 * - 下方简洁两段切换：「空教室自习」与「广工百宝箱」。
 */
export function CampusPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [localTab, setLocalTab] = useState<CampusTab>('rooms');
  const [mapQuery, setMapQuery] = useState('');

  const activeTab: CampusTab = parseCampusTab(searchParams.get('tab')) ?? localTab;

  const switchTab = (next: CampusTab) => {
    setLocalTab(next);
    if (searchParams.has('tab')) {
      const sp = new URLSearchParams(searchParams);
      sp.delete('tab');
      setSearchParams(sp, { replace: true });
    }
  };

  const handleMapSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = mapQuery.trim();
    if (q) {
      void navigate(`/map?q=${encodeURIComponent(q)}`);
    } else {
      void navigate('/map');
    }
  };

  return (
    <>
      <PageHeader title="校园" subtitle="3D 地图导航 · 空教室自习 · 广工实用百宝箱" />

      {/* 顶部 3D 校园地图快速直达卡 */}
      <GlassCard className="mb-4 space-y-3.5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
              <MapIcon size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[16px] font-bold">大学城 3D 校园地图</h2>
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  GPS 导航
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-fg-muted">教学楼 · 饭堂 · 宿舍 · 图书馆实景步行/骑行引导</p>
            </div>
          </div>

          <Button className="h-9 shrink-0 gap-1.5 px-3.5 text-xs" onClick={() => void navigate('/map')}>
            <NavigationIcon size={14} />
            进入地图
          </Button>
        </div>

        <form onSubmit={handleMapSearch} className="flex items-center gap-2">
          <div className="surface-subtle flex flex-1 items-center gap-2 rounded-2xl px-3 py-2">
            <SearchIcon size={15} className="shrink-0 text-fg-muted" />
            <input
              type="search"
              value={mapQuery}
              onChange={(e) => setMapQuery(e.target.value)}
              placeholder="去哪？搜教3-305、二饭、图书馆、东十…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted/75"
            />
          </div>
          <Button type="submit" variant="ghost" className="h-9 shrink-0 px-3 text-xs">
            导航
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-fg-muted">常去：</span>
          {QUICK_MAP_CHIPS.map((place) => (
            <button
              key={place}
              type="button"
              onClick={() => void navigate(`/map?q=${encodeURIComponent(place)}`)}
              className="surface-subtle surface-subtle-hover rounded-full px-2.5 py-1 text-xs font-medium text-fg-muted hover:text-accent"
            >
              {place}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* 二段切换：空教室自习 | 广工百宝箱 */}
      <div className="glass-thin mb-4 grid grid-cols-2 rounded-full p-1" role="tablist" aria-label="校园服务">
        {(
          [
            { id: 'rooms', label: '空教室自习' },
            { id: 'toolbox', label: '广工百宝箱' },
          ] as const
        ).map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchTab(item.id)}
              className={`relative rounded-full py-2 text-sm transition-colors ${
                active ? 'font-semibold text-accent-fg' : 'text-fg-muted'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="campus-tab-pill"
                  className="absolute inset-0 rounded-full bg-accent shadow-sm"
                  transition={spring.snappy}
                />
              )}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'rooms' ? <EmptyClassroomPanel /> : <CampusToolboxPanel />}
    </>
  );
}
