import {
  BUILDING_CATEGORY_LABELS,
  distanceMeters,
  distanceToRouteMeters,
  GDUT_HEMC_BUILDINGS,
  getCampusBuilding,
  isInsideCampusBounds,
  latLngToLocal,
  matchCampusBuilding,
  planCampusRoute,
  searchCampusBuildings,
  type BuildingCategory,
  type CampusBuilding,
  type CampusRoutePlan,
  type RouteEndpoint,
  type RouteMode,
} from '@gduthelp/shared';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  LocateIcon,
  MoonIcon,
  NavigationIcon,
  PinIcon,
  SearchIcon,
  SunIcon,
  SwapVerticalIcon,
  XIcon,
} from '../../components/icons';
import { useAuth } from '../../lib/auth-store';
import { getCurrentLocation, LocationError, watchLocation, type GeoFix } from '../../lib/location';
import { hapticLight } from '../../lib/native-ux';
import { pushSheet } from '../../lib/sheet-stack';
import { toast } from '../../lib/toast-store';
import { useNow } from '../../lib/use-now';
import {
  getCampusLighting,
  MAP_TIME_MODE_LABELS,
  type MapTimeMode,
} from './campus-lighting';
import type { CameraControlApi, CameraTarget } from './CampusScene3D';

const CampusScene3D = lazy(() => import('./CampusScene3D').then((m) => ({ default: m.CampusScene3D })));

const CATEGORIES: BuildingCategory[] = [
  'all',
  'teaching',
  'lab',
  'dorm-west',
  'dorm-east',
  'canteen',
  'landmark',
  'sports',
];

const TIME_MODES: MapTimeMode[] = ['auto', 'day', 'dusk', 'night'];

const QUICK_PICKS = ['library', 'jiao3', 'big3', 'gong1', 'canteen1', 'canteen2', 'canteen3', 'canteen4', 'xi6', 'dong9'];

type StartSpec = { kind: 'gps' } | { kind: 'building'; buildingId: string };

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

interface InitialDeepLink {
  selectedId: string | null;
  endBuildingId: string | null;
  classroomNote: string | null;
  query: string;
  searchOpen: boolean;
  cameraTarget: CameraTarget | null;
  unmatchedQuery: string | null;
  hadParam: boolean;
}

function resolveInitialDeepLink(params: URLSearchParams): InitialDeepLink {
  const qParam = params.get('q')?.trim() ?? '';
  const toParam = params.get('to')?.trim() ?? '';
  if (!qParam && !toParam) {
    return {
      selectedId: null,
      endBuildingId: null,
      classroomNote: null,
      query: '',
      searchOpen: false,
      cameraTarget: null,
      unmatchedQuery: null,
      hadParam: false,
    };
  }

  const matched =
    (toParam ? getCampusBuilding(toParam) : null) ?? (qParam ? matchCampusBuilding(qParam) : null);
  if (matched) {
    const p = latLngToLocal(matched.lat, matched.lng);
    return {
      selectedId: matched.id,
      endBuildingId: matched.id,
      classroomNote: qParam && qParam !== matched.name && qParam !== matched.shortName ? qParam : null,
      query: '',
      searchOpen: false,
      cameraTarget: { x: p.x, z: p.z, distance: 440, seq: 1 },
      unmatchedQuery: null,
      hadParam: true,
    };
  }

  return {
    selectedId: null,
    endBuildingId: null,
    classroomNote: null,
    query: qParam,
    searchOpen: Boolean(qParam),
    cameraTarget: null,
    unmatchedQuery: qParam || null,
    hadParam: true,
  };
}

export function MapPage() {
  const isAuthed = useAuth((s) => s.status === 'authenticated');
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialLink] = useState(() => resolveInitialDeepLink(searchParams));
  const now = useNow(60_000);

  const handleBackToLogin = useCallback(() => {
    hapticLight();
    const fromLogin = Boolean((location.state as { fromLogin?: boolean } | null)?.fromLogin);
    const historyIdx = (window.history.state as { idx?: unknown } | null)?.idx;
    if (fromLogin && typeof historyIdx === 'number' && historyIdx > 0) {
      navigate(-1);
    } else {
      navigate('/login', { replace: true });
    }
  }, [location.state, navigate]);

  const [timeMode, setTimeMode] = useState<MapTimeMode>('auto');
  const [view3d, setView3d] = useState(true);
  const [category, setCategory] = useState<BuildingCategory>('all');
  const [query, setQuery] = useState(initialLink.query);
  const [searchOpen, setSearchOpen] = useState(initialLink.searchOpen);

  useEffect(() => {
    if (!searchOpen) return;
    return pushSheet(() => setSearchOpen(false));
  }, [searchOpen]);

  const [selectedId, setSelectedId] = useState<string | null>(initialLink.selectedId);
  const [classroomNote, setClassroomNote] = useState<string | null>(initialLink.classroomNote);

  // 导航状态（档位 1：校内精准定位 + 步行/骑行真实路网规划 + 偏航重算）
  const [navActive, setNavActive] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>('walk');
  const [startSpec, setStartSpec] = useState<StartSpec>({ kind: 'building', buildingId: 'xi6' });
  const [endBuildingId, setEndBuildingId] = useState<string | null>(initialLink.endBuildingId);
  const [pickingStart, setPickingStart] = useState(false);
  const [startSearch, setStartSearch] = useState('');
  const [stepsExpanded, setStepsExpanded] = useState(false);

  // GPS 实时定位
  const [userFix, setUserFix] = useState<GeoFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [tracking, setTracking] = useState(false);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const lastRerouteAtRef = useRef(0);

  // 相机控制
  const controlApiRef = useRef<CameraControlApi | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(initialLink.cameraTarget);
  const [yawDeg, setYawDeg] = useState(0);
  const seqRef = useRef(1);

  const lighting = useMemo(() => getCampusLighting(timeMode, now), [timeMode, now]);
  const userInsideCampus = useMemo(
    () => (userFix ? isInsideCampusBounds(userFix.lat, userFix.lng) : false),
    [userFix],
  );

  const flyTo = useCallback((lat: number, lng: number, distance?: number) => {
    const p = latLngToLocal(lat, lng);
    seqRef.current += 1;
    setCameraTarget({ x: p.x, z: p.z, distance, seq: seqRef.current });
  }, []);

  const flyToRoute = useCallback((plan: CampusRoutePlan) => {
    if (!plan.waypoints.length) return;
    const locals = plan.waypoints.map((w) => latLngToLocal(w.lat, w.lng));
    const minX = Math.min(...locals.map((p) => p.x));
    const maxX = Math.max(...locals.map((p) => p.x));
    const minZ = Math.min(...locals.map((p) => p.z));
    const maxZ = Math.max(...locals.map((p) => p.z));
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const span = Math.max(spanX * 1.15, spanZ * 1.3, 280);
    seqRef.current += 1;
    setCameraTarget({
      x: (minX + maxX) / 2 + 65,
      z: (minZ + maxZ) / 2 + 65,
      distance: Math.min(2200, Math.max(480, span * 1.32)),
      seq: seqRef.current,
    });
  }, []);

  // 消费深链 URL 参数后的轻副作用（提示未匹配教室 + 清理 query，不调用 setState）
  useEffect(() => {
    if (!initialLink.hadParam) return;
    if (initialLink.unmatchedQuery) {
      toast.info(`未自动识别「${initialLink.unmatchedQuery}」，可在顶部搜索楼栋名`);
    }
    setSearchParams({}, { replace: true });
  }, [initialLink.hadParam, initialLink.unmatchedQuery, setSearchParams]);

  // 组件卸载时停止 GPS 监听
  useEffect(() => {
    return () => {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
    };
  }, []);

  const selectedBuilding = useMemo(
    () => (selectedId ? (getCampusBuilding(selectedId) ?? null) : null),
    [selectedId],
  );
  const endBuilding = useMemo(
    () => (endBuildingId ? (getCampusBuilding(endBuildingId) ?? null) : null),
    [endBuildingId],
  );

  // 计算当前激活的导航路线
  const activeRoute = useMemo<CampusRoutePlan | null>(() => {
    if (!navActive || !endBuildingId) return null;
    let startEp: RouteEndpoint;
    if (startSpec.kind === 'gps') {
      if (!userFix || !userInsideCampus) return null;
      startEp = { kind: 'coord', lat: userFix.lat, lng: userFix.lng };
    } else {
      startEp = { kind: 'building', buildingId: startSpec.buildingId };
    }
    return planCampusRoute(startEp, { kind: 'building', buildingId: endBuildingId }, routeMode);
  }, [endBuildingId, navActive, routeMode, startSpec, userFix, userInsideCampus]);

  // 供 GPS 实时回调读取最新导航快照（事件驱动检测偏航，避免在 effect 里同步 setState）
  const navSnapshotRef = useRef({ navActive, activeRoute });
  useEffect(() => {
    navSnapshotRef.current = { navActive, activeRoute };
  }, [navActive, activeRoute]);

  const handleSelectBuilding = useCallback(
    (b: CampusBuilding) => {
      hapticLight();
      setSelectedId(b.id);
      setClassroomNote(null);
      setSearchOpen(false);
      setQuery('');
      if (pickingStart) {
        setStartSpec({ kind: 'building', buildingId: b.id });
        setPickingStart(false);
        setStartSearch('');
        return;
      }
      if (navActive) {
        setEndBuildingId(b.id);
      }
      flyTo(b.lat, b.lng, 430);
    },
    [flyTo, navActive, pickingStart],
  );

  const startNavigationTo = useCallback(
    (target: CampusBuilding) => {
      hapticLight();
      setSelectedId(target.id);
      setEndBuildingId(target.id);
      setNavActive(true);
      setStepsExpanded(false);
      setPickingStart(false);

      let nextStart: StartSpec = startSpec;
      if (userFix && userInsideCampus) {
        nextStart = { kind: 'gps' };
      } else if (startSpec.kind === 'building' && startSpec.buildingId === target.id) {
        nextStart = { kind: 'building', buildingId: target.id === 'library' ? 'xi6' : 'library' };
      } else if (startSpec.kind === 'gps') {
        nextStart = { kind: 'building', buildingId: target.id === 'xi6' ? 'library' : 'xi6' };
      }
      setStartSpec(nextStart);

      const ep: RouteEndpoint =
        nextStart.kind === 'gps' && userFix
          ? { kind: 'coord', lat: userFix.lat, lng: userFix.lng }
          : { kind: 'building', buildingId: nextStart.kind === 'building' ? nextStart.buildingId : 'xi6' };
      const plan = planCampusRoute(ep, { kind: 'building', buildingId: target.id }, routeMode);
      if (plan) flyToRoute(plan);
    },
    [flyToRoute, routeMode, startSpec, userFix, userInsideCampus],
  );

  const handleLocateOnce = async () => {
    hapticLight();
    setLocating(true);
    try {
      const fix = await getCurrentLocation();
      setUserFix(fix);
      if (isInsideCampusBounds(fix.lat, fix.lng)) {
        flyTo(fix.lat, fix.lng, 420);
        toast.success(`已定位到校内位置（精度约 ${fix.accuracy}m）`);
        if (navActive) setStartSpec({ kind: 'gps' });
      } else {
        toast.info('当前不在广工大学城校区范围内，可在下方手动选择校内起点');
      }
    } catch (err) {
      toast.error(err instanceof LocationError ? err.message : '定位失败，请检查定位权限');
    } finally {
      setLocating(false);
    }
  };

  const toggleLiveTracking = async () => {
    hapticLight();
    if (tracking) {
      stopWatchRef.current?.();
      stopWatchRef.current = null;
      setTracking(false);
      toast.info('已停止实时定位追踪');
      return;
    }
    setLocating(true);
    try {
      const firstFix = await getCurrentLocation();
      setUserFix(firstFix);
      const inside = isInsideCampusBounds(firstFix.lat, firstFix.lng);
      if (inside) {
        setStartSpec({ kind: 'gps' });
        flyTo(firstFix.lat, firstFix.lng, 360);
      } else {
        toast.info('你当前不在大学城校区内，已为你保留校内手动起点进行路线预览');
      }
      const stop = await watchLocation(
        (fix) => {
          setUserFix(fix);
          if (isInsideCampusBounds(fix.lat, fix.lng)) {
            setStartSpec((prev) => (prev.kind === 'gps' ? prev : { kind: 'gps' }));
            const snap = navSnapshotRef.current;
            if (snap.navActive && snap.activeRoute) {
              const offDist = distanceToRouteMeters(fix, snap.activeRoute.waypoints);
              const nowMs = Date.now();
              if (offDist > 35 && nowMs - lastRerouteAtRef.current > 10_000) {
                lastRerouteAtRef.current = nowMs;
                toast.info('检测到路线偏移，已按当前位置自动重算');
              }
            }
          }
        },
        (err) => {
          toast.error(err.message);
        },
      );
      stopWatchRef.current = stop;
      setTracking(true);
      if (inside) toast.success('已开启校内实时跟走导航（偏航将自动重算）');
    } catch (err) {
      toast.error(err instanceof LocationError ? err.message : '开启实时定位失败');
    } finally {
      setLocating(false);
    }
  };

  const cycleTimeMode = () => {
    hapticLight();
    const idx = TIME_MODES.indexOf(timeMode);
    const next = TIME_MODES[(idx + 1) % TIME_MODES.length]!;
    setTimeMode(next);
  };

  const swapEndpoints = () => {
    if (!endBuildingId || startSpec.kind !== 'building') {
      toast.info('仅支持交换两个校内楼栋起终点');
      return;
    }
    hapticLight();
    const prevStart = startSpec.buildingId;
    setStartSpec({ kind: 'building', buildingId: endBuildingId });
    setEndBuildingId(prevStart);
    setSelectedId(prevStart);
  };

  const searchResults = useMemo(() => searchCampusBuildings(query).slice(0, 8), [query]);
  const startSearchResults = useMemo(() => searchCampusBuildings(startSearch).slice(0, 6), [startSearch]);

  const startLabel =
    startSpec.kind === 'gps'
      ? userInsideCampus
        ? '我的当前位置 (GPS)'
        : '定位在校外，点此选校内起点'
      : (getCampusBuilding(startSpec.buildingId)?.name ?? '选择起点');

  const panelSurface = lighting.isDark
    ? 'bg-slate-950/84 text-slate-50 ring-1 ring-white/15 backdrop-blur-md shadow-[0_14px_40px_-14px_rgba(0,0,0,0.65)]'
    : 'bg-white/93 text-slate-900 ring-1 ring-slate-900/12 backdrop-blur-md shadow-[0_14px_40px_-14px_rgba(15,23,42,0.18)]';

  const mutedText = lighting.isDark ? 'text-slate-300' : 'text-slate-500';
  const subtlePill = lighting.isDark
    ? 'bg-white/10 text-slate-100 hover:bg-white/15'
    : 'bg-slate-900/6 text-slate-700 hover:bg-slate-900/10';

  const distanceToSelected = useMemo(() => {
    if (!selectedBuilding || !userFix || !userInsideCampus) return null;
    return Math.round(distanceMeters(userFix, selectedBuilding));
  }, [selectedBuilding, userFix, userInsideCampus]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* 3D 广工大学城校园地图主体 */}
      <ErrorBoundary
        fallback={
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="glass max-w-sm rounded-3xl p-6">
              <p className="text-base font-semibold">3D 校园地图加载受限</p>
              <p className="mt-2 text-sm text-fg-muted">当前设备 WebGL 暂不可用，请刷新页面或切换系统 WebView 重试。</p>
            </div>
          </div>
        }
      >
        <Suspense
          fallback={
            <div
              className="grid h-full place-items-center text-sm"
              style={{ background: lighting.skyBg, color: lighting.isDark ? '#e2e8f0' : '#334155' }}
            >
              正在构建广工大学城 3D 校园模型…
            </div>
          }
        >
          <CampusScene3D
            lighting={lighting}
            view3d={view3d}
            category={category}
            selectedId={selectedId}
            route={activeRoute}
            routeEndId={navActive ? endBuildingId : null}
            userFix={userFix}
            userInsideCampus={userInsideCampus}
            cameraTarget={cameraTarget}
            controlApiRef={controlApiRef}
            onSelectBuilding={handleSelectBuilding}
            onYawChange={(rad) => setYawDeg(Math.round((rad * 180) / Math.PI))}
          />
        </Suspense>
      </ErrorBoundary>

      {/* 顶部悬浮搜索栏 + 分区筛选芯片 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(env(safe-area-inset-top),12px)] xl:px-6 xl:pt-5">
        <div className="mx-auto max-w-xl space-y-2">
          <div className={`pointer-events-auto relative rounded-2xl ${panelSurface}`}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              {!isAuthed && (
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors ${subtlePill}`}
                  aria-label="返回登录"
                  title="返回登录"
                >
                  <ArrowLeftIcon size={17} />
                </button>
              )}
              <SearchIcon size={18} className={`shrink-0 ${mutedText}`} />
              <input
                type="text"
                enterKeyHint="search"
                value={query}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="搜广工楼栋：教3 / 三号大教室 / 西6 / 工学1 / 四饭…"
                className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
                  lighting.isDark ? 'placeholder:text-slate-400' : 'placeholder:text-slate-500'
                }`}
                aria-label="搜索广工大学城楼栋"
              />
              {(query || searchOpen) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setSearchOpen(false);
                  }}
                  className={`grid size-7 shrink-0 place-items-center rounded-full ${subtlePill}`}
                  aria-label="关闭搜索"
                >
                  <XIcon size={14} />
                </button>
              )}
              {!isAuthed ? (
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-orange-600"
                >
                  登录
                </button>
              ) : (
                <span
                  className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${subtlePill}`}
                >
                  大学城 · {lighting.label}
                </span>
              )}
            </div>

            {/* 搜索联想结果 */}
            {searchOpen && (
              <div className="max-h-64 overflow-y-auto border-t border-current/10 py-1.5">
                {searchResults.length === 0 ? (
                  <p className={`px-4 py-3 text-center text-xs ${mutedText}`}>
                    未找到匹配的大学城校区建筑，试试搜「教3」「大教室」「西6」「四饭」
                  </p>
                ) : (
                  searchResults.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBuilding(b)}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-current/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {b.name}{' '}
                          <span className={`ml-1 text-xs font-normal ${mutedText}`}>
                            {BUILDING_CATEGORY_LABELS[b.category]}
                          </span>
                        </p>
                        <p className={`truncate text-xs ${mutedText}`}>{b.tip}</p>
                      </div>
                      <ChevronRightIcon size={15} className={`shrink-0 ${mutedText}`} />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 分类筛选横条 */}
          <div className="no-scrollbar pointer-events-auto flex gap-1.5 overflow-x-auto pb-0.5">
            {CATEGORIES.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    hapticLight();
                    setCategory(cat);
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-orange-500 text-white shadow-sm'
                      : lighting.isDark
                        ? 'bg-slate-950/70 text-slate-200 ring-1 ring-white/15 backdrop-blur-sm'
                        : 'bg-white/82 text-slate-700 ring-1 ring-slate-900/10 backdrop-blur-sm'
                  }`}
                >
                  {BUILDING_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 右侧浮动地图工具列（昼夜切换、2D/3D、指南针复位、缩放、GPS定位） */}
      <div className="pointer-events-auto absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-2 xl:right-6">
        <button
          type="button"
          onClick={cycleTimeMode}
          title={`光照模式：${MAP_TIME_MODE_LABELS[timeMode]}（点击切换）`}
          className={`flex flex-col items-center justify-center rounded-2xl px-2 py-2 text-[10px] font-medium ${panelSurface}`}
        >
          {lighting.isDark ? <MoonIcon size={17} /> : <SunIcon size={17} />}
          <span className="mt-0.5 leading-none">{MAP_TIME_MODE_LABELS[timeMode]}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight();
            setView3d((v) => !v);
          }}
          title="切换 3D 建筑视角 / 2D 俯视图"
          className={`grid size-11 place-items-center rounded-2xl text-xs font-bold ${panelSurface}`}
        >
          {view3d ? '3D' : '2D'}
        </button>

        <button
          type="button"
          onClick={() => {
            hapticLight();
            controlApiRef.current?.resetNorth();
          }}
          title="指北复位"
          className={`grid size-11 place-items-center rounded-2xl ${panelSurface}`}
          aria-label="指北复位"
        >
          <span style={{ transform: `rotate(${-yawDeg}deg)`, display: 'inline-flex', transition: 'transform 150ms' }}>
            <CompassIcon size={19} />
          </span>
        </button>

        <div className={`flex flex-col overflow-hidden rounded-2xl ${panelSurface}`}>
          <button
            type="button"
            onClick={() => controlApiRef.current?.zoomBy(0.76)}
            className="grid size-10 place-items-center text-base font-semibold hover:bg-current/5"
            aria-label="放大地图"
          >
            +
          </button>
          <div className="h-px bg-current opacity-10" />
          <button
            type="button"
            onClick={() => controlApiRef.current?.zoomBy(1.3)}
            className="grid size-10 place-items-center text-base font-semibold hover:bg-current/5"
            aria-label="缩小地图"
          >
            −
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleLocateOnce()}
          disabled={locating}
          title="定位到当前位置"
          className={`grid size-11 place-items-center rounded-2xl ${
            tracking || userInsideCampus
              ? 'bg-blue-600 text-white shadow-lg ring-2 ring-white/50'
              : panelSurface
          }`}
          aria-label="定位当前位置"
        >
          <LocateIcon size={19} className={locating ? 'animate-pulse' : undefined} />
        </button>
      </div>

      {/* 底部交互卡片：楼栋详情 / 路线规划导航面板 / 快速直达入口（登录态留足底部 TabBar 安全距离） */}
      <div
        className={`pointer-events-none absolute inset-x-0 z-20 px-3 xl:bottom-6 xl:px-6 ${
          isAuthed
            ? 'bottom-[calc(max(env(safe-area-inset-bottom),12px)+80px)]'
            : 'bottom-[max(env(safe-area-inset-bottom),16px)]'
        }`}
      >
        <div className="mx-auto max-w-xl">
          {navActive && endBuilding ? (
            /* ---------- 路线规划与实时跟走面板 ---------- */
            <div className={`pointer-events-auto rounded-3xl p-4 ${panelSurface}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                    <button
                      type="button"
                      onClick={() => setPickingStart((v) => !v)}
                      className={`min-w-0 flex-1 truncate rounded-xl px-2.5 py-1 text-left text-xs font-medium ${subtlePill}`}
                    >
                      起点：{startLabel}
                    </button>
                    <button
                      type="button"
                      onClick={swapEndpoints}
                      className={`grid size-7 shrink-0 place-items-center rounded-full ${subtlePill}`}
                      title="交换起终点"
                      aria-label="交换起终点"
                    >
                      <SwapVerticalIcon size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full bg-orange-500" />
                    <p className="truncate px-2.5 text-sm font-semibold">
                      终点：{endBuilding.name}
                      {classroomNote && (
                        <span className="ml-1.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-500">
                          {classroomNote}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNavActive(false);
                    setPickingStart(false);
                    if (tracking) void toggleLiveTracking();
                  }}
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${subtlePill}`}
                  aria-label="退出路线规划"
                >
                  <XIcon size={15} />
                </button>
              </div>

              {/* 起点快速选择器 */}
              {pickingStart && (
                <div className="mt-2.5 space-y-2 rounded-2xl border border-current/10 p-2.5">
                  <div className="flex gap-1.5">
                    <input
                      value={startSearch}
                      onChange={(e) => setStartSearch(e.target.value)}
                      placeholder="输入校内起点（如 西6 / 东9 / 图书馆）"
                      className="min-w-0 flex-1 rounded-xl bg-current/5 px-2.5 py-1.5 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleLocateOnce()}
                      className="shrink-0 rounded-xl bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white"
                    >
                      用 GPS
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {startSearchResults.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setStartSpec({ kind: 'building', buildingId: b.id });
                          setPickingStart(false);
                          setStartSearch('');
                        }}
                        className={`rounded-full px-2.5 py-1 text-xs ${subtlePill}`}
                      >
                        {b.shortName}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 步行 / 骑行切换 + 距离耗时 + 实时跟走按钮 */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className={`inline-flex rounded-full p-0.5 text-xs ${subtlePill}`}>
                  {(
                    [
                      { id: 'walk', label: '步行' },
                      { id: 'bike', label: '骑行' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        hapticLight();
                        setRouteMode(m.id);
                      }}
                      className={`rounded-full px-3 py-1 font-medium transition-colors ${
                        routeMode === m.id ? 'bg-orange-500 text-white' : ''
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                {activeRoute ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-num text-base font-bold text-orange-500 tabular-nums">
                      约 {activeRoute.durationMinutes} 分钟
                    </span>
                    <span className={`font-num text-xs tabular-nums ${mutedText}`}>
                      {formatDistance(activeRoute.distanceMeters)}
                    </span>
                  </div>
                ) : (
                  <span className={`text-xs ${mutedText}`}>请选择校内起点以规划路线</span>
                )}

                <Button
                  className="h-9 px-3.5 text-xs"
                  loading={locating}
                  onClick={() => void toggleLiveTracking()}
                >
                  <NavigationIcon size={14} />
                  {tracking ? '停止跟走' : '实时跟走'}
                </Button>
              </div>

              {/* 关键通道提示（天桥 / 隧道） + 可展开分步文字指引 */}
              {activeRoute && (
                <div className="mt-2.5 border-t border-current/10 pt-2">
                  <button
                    type="button"
                    onClick={() => setStepsExpanded((v) => !v)}
                    className="flex w-full items-center justify-between text-xs"
                  >
                    <span className={`truncate ${mutedText}`}>
                      {activeRoute.crossings.length > 0
                        ? `途经：${activeRoute.crossings.join(' · ')}`
                        : routeMode === 'bike'
                          ? '已自动避开天桥台阶，全程可骑行'
                          : `共 ${activeRoute.steps.length} 段路线指引`}
                    </span>
                    <span className="shrink-0 font-medium text-orange-500">
                      {stepsExpanded ? '收起指引' : '分步指引'}
                    </span>
                  </button>

                  {stepsExpanded && (
                    <ol className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1 text-xs">
                      {activeRoute.steps.map((st, idx) => (
                        <li key={`${st.roadName}-${idx}`} className="flex items-start gap-2">
                          <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-orange-500/20 font-num text-[10px] font-bold text-orange-500">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p>
                              沿 <span className="font-semibold">{st.roadName}</span> {st.direction}前行{' '}
                              <span className="font-num tabular-nums">{formatDistance(st.distanceMeters)}</span>
                            </p>
                            {st.note && <p className={`text-[11px] ${mutedText}`}>{st.note}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          ) : selectedBuilding ? (
            /* ---------- 选中楼栋详情卡 ---------- */
            <div className={`pointer-events-auto rounded-3xl p-4 ${panelSurface}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold">{selectedBuilding.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${subtlePill}`}>
                      {BUILDING_CATEGORY_LABELS[selectedBuilding.category]}
                    </span>
                    {classroomNote && (
                      <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-500">
                        课表教室：{classroomNote}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-xs leading-relaxed ${mutedText}`}>{selectedBuilding.tip}</p>
                  {(selectedBuilding.entrance || distanceToSelected !== null) && (
                    <p className={`mt-1.5 flex flex-wrap items-center gap-2 text-xs ${mutedText}`}>
                      {distanceToSelected !== null && (
                        <span className="font-num font-medium text-blue-500 tabular-nums">
                          距你直线约 {formatDistance(distanceToSelected)}
                        </span>
                      )}
                      {selectedBuilding.entrance && (
                        <span className="inline-flex items-center gap-1">
                          <PinIcon size={12} />
                          入口：{selectedBuilding.entrance}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setClassroomNote(null);
                  }}
                  className={`grid size-8 shrink-0 place-items-center rounded-full ${subtlePill}`}
                  aria-label="关闭详情"
                >
                  <XIcon size={15} />
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <Button className="h-10 flex-1 text-sm" onClick={() => startNavigationTo(selectedBuilding)}>
                  <NavigationIcon size={15} />
                  到这里去
                </Button>
                <Button
                  variant="ghost"
                  className="h-10 px-3.5 text-sm"
                  onClick={() => {
                    setStartSpec({ kind: 'building', buildingId: selectedBuilding.id });
                    toast.success(`已将「${selectedBuilding.shortName}」设为出发起点，再点目标楼栋即可规划路线`);
                    setSelectedId(null);
                  }}
                >
                  设为起点
                </Button>
              </div>
            </div>
          ) : (
            /* ---------- 默认轻巧快捷条（不遮挡 3D 视野） ---------- */
            <div className={`pointer-events-auto rounded-3xl px-3.5 py-2.5 ${panelSurface}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">广工大学城 3D 地图 · 点击楼栋查位置或导航</p>
                <button
                  type="button"
                  onClick={() => {
                    const lib = getCampusBuilding('library')!;
                    startNavigationTo(lib);
                  }}
                  className="shrink-0 text-xs font-semibold text-orange-500"
                >
                  路线规划 →
                </button>
              </div>
              <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                {QUICK_PICKS.map((id) => {
                  const b = getCampusBuilding(id);
                  if (!b) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectBuilding(b)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${subtlePill}`}
                    >
                      {b.shortName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const MAP_BUILDING_COUNT = GDUT_HEMC_BUILDINGS.length;
