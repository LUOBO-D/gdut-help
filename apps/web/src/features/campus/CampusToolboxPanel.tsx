import { GDUT_CAMPUS_SERVICES, type CampusServiceLink } from '@gduthelp/shared';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { GlassCard } from '../../components/GlassCard';
import { CopyIcon, ExternalLinkIcon, NavigationIcon, PhoneIcon, SearchIcon, XIcon } from '../../components/icons';
import { toast } from '../../lib/toast-store';

type CategoryFilter = 'all' | CampusServiceLink['category'];

const CATEGORY_META: { id: CampusServiceLink['category']; title: string; short: string }[] = [
  { id: 'digital', title: '学习与正版福利', short: '福利与站点' },
  { id: 'transit', title: '出行与跨校区校车', short: '出行校车' },
  { id: 'life', title: '报修与校园电话黄页', short: '报修电话' },
];

/**
 * 广工实用百宝箱：
 * 收录高频校园官网入口、正版软件/CARSI 论文福利、校车/地铁末班信息及校园应急/报修电话，
 * 全部支持一键直达（拨号 / 复制 / 打开网页 / 3D 地图导航）。
 */
export function CampusToolboxPanel() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const trimmed = keyword.trim().toLowerCase();

  const filtered = useMemo(() => {
    return GDUT_CAMPUS_SERVICES.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!trimmed) return true;
      const haystack = `${item.title} ${item.subtitle} ${item.detail} ${item.badge ?? ''} ${item.phone ?? ''}`.toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [category, trimmed]);

  const sections = useMemo(() => {
    return CATEGORY_META.map((meta) => ({
      ...meta,
      items: filtered.filter((item) => item.category === meta.id),
    })).filter((s) => s.items.length > 0);
  }, [filtered]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制${label}：${text}`);
    } catch {
      toast.info(`${label}：${text}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* 快捷搜索 + 分类筛选 */}
      <div className="space-y-2.5">
        <div className="glass-thin flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
          <SearchIcon size={16} className="shrink-0 text-fg-muted" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜正版软件、知网、校车、地铁、宽带报修、电话…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted/75"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              aria-label="清空搜索"
              className="text-fg-muted hover:text-fg"
            >
              <XIcon size={15} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              category === 'all' ? 'bg-accent text-accent-fg' : 'glass-thin text-fg-muted hover:text-fg'
            }`}
          >
            全部 ({GDUT_CAMPUS_SERVICES.length})
          </button>
          {CATEGORY_META.map((meta) => (
            <button
              key={meta.id}
              type="button"
              onClick={() => setCategory(meta.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                category === meta.id ? 'bg-accent text-accent-fg' : 'glass-thin text-fg-muted hover:text-fg'
              }`}
            >
              {meta.short}
            </button>
          ))}
        </div>
      </div>

      {sections.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-fg-muted">
          没有找到匹配「{keyword.trim()}」的校园服务，试试搜「知网」「校车」或「报修」
        </GlassCard>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.id} className="space-y-2.5">
              <h2 className="px-1 text-xs font-semibold tracking-wide text-fg-muted">{section.title}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <GlassCard key={item.id} className="flex flex-col justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-[15px] font-semibold leading-snug">{item.title}</h3>
                        {item.badge && (
                          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-medium text-fg-muted">{item.subtitle}</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-fg-muted/90">{item.detail}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {item.phone && (
                        <>
                          <a
                            href={`tel:${item.phone}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 font-num text-xs font-semibold text-accent-fg tabular-nums transition-opacity hover:opacity-90"
                          >
                            <PhoneIcon size={12} />
                            {item.phone}
                          </a>
                          <button
                            type="button"
                            onClick={() => void copyText(item.phone!, '电话')}
                            className="surface-subtle surface-subtle-hover inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-fg-muted"
                          >
                            <CopyIcon size={12} />
                            复制
                          </button>
                        </>
                      )}

                      {item.url && (
                        <>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-opacity hover:opacity-85"
                          >
                            <ExternalLinkIcon size={12} />
                            打开入口
                          </a>
                          {!item.phone && (
                            <button
                              type="button"
                              onClick={() => void copyText(item.url!, '网址')}
                              className="surface-subtle surface-subtle-hover inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-fg-muted"
                            >
                              <CopyIcon size={12} />
                              复制网址
                            </button>
                          )}
                        </>
                      )}

                      {item.mapQuery && (
                        <button
                          type="button"
                          onClick={() => void navigate(`/map?q=${encodeURIComponent(item.mapQuery!)}`)}
                          className="surface-subtle surface-subtle-hover inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-accent"
                        >
                          <NavigationIcon size={12} />
                          3D 导航
                        </button>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
