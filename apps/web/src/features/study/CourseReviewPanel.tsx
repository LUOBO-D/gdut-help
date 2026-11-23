import {
  CAMPUSES,
  PE_SUBCATEGORIES,
  PUBLIC_ELECTIVE_SUBCATEGORIES,
  SHARED_COURSE_CATEGORY_LABELS,
  type CourseSortOption,
  type SharedCourseCategory,
} from '@gduthelp/shared';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { GlassCard } from '../../components/GlassCard';
import { PlusIcon, SearchIcon, XIcon } from '../../components/icons';
import { CardSkeleton } from '../../components/Skeleton';
import { useSharedCourses } from '../../lib/queries';
import { spring } from '../../motion/presets';
import { CourseReviewDetailSheet } from './CourseReviewDetailSheet';
import { CourseReviewEditorSheet, type CourseReviewDraft } from './CourseReviewEditorSheet';
import { ElectiveCatalogSyncSheet } from './ElectiveCatalogSyncSheet';

const SORT_ITEMS: { id: CourseSortOption; label: string }[] = [
  { id: 'bayes', label: '口碑综合' },
  { id: 'grading', label: '给分最香' },
  { id: 'workload', label: '最轻松' },
  { id: 'reviews', label: '评价最多' },
  { id: 'latest', label: '最新更新' },
];

const QUICK_FILTER_TAGS = ['给分高', '不点名', '水课推荐', '捞人', '干货满满', '作业少'] as const;

/**
 * 广工选课评价全校共享库面板（位于「学业 → 选课」）：
 * 严格聚焦「公共选修课」与「体育选课」两大类，内置基础目录 + 支持教务一键同步与表格批量导入，
 * 分页加载保障千门公选课下依然秒开不卡。
 */
export function CourseReviewPanel() {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<SharedCourseCategory | undefined>(undefined);
  const [subCategory, setSubCategory] = useState<string | undefined>(undefined);
  const [tag, setTag] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<CourseSortOption>('bayes');
  const [onlyReviewed, setOnlyReviewed] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<CourseReviewDraft | null>(null);
  const [catalogSyncOpen, setCatalogSyncOpen] = useState(false);

  const coursesQuery = useSharedCourses({
    q: keyword.trim() || undefined,
    category,
    subCategory,
    tag,
    sort,
    onlyReviewed,
    page,
    pageSize,
  });

  const items = coursesQuery.data?.items ?? [];
  const total = coursesQuery.data?.total ?? 0;
  const hasMore = coursesQuery.data?.hasMore ?? false;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const subChips =
    category === 'general_elective'
      ? PUBLIC_ELECTIVE_SUBCATEGORIES
      : category === 'pe'
        ? PE_SUBCATEGORIES
        : null;

  const selectCategory = (next: SharedCourseCategory | undefined) => {
    setCategory(next);
    setSubCategory(undefined);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* 顶部共享库说明 + 导入目录 / 写评价 */}
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">广工公共选修 & 体育选课共享库</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            已收录 <strong className="font-num text-fg tabular-nums">{total}</strong> 门课程 · 全校共建共享
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" className="h-9 px-3 text-xs" onClick={() => setCatalogSyncOpen(true)}>
            导入目录
          </Button>
          <Button className="h-9 gap-1 px-3.5 text-xs" onClick={() => setEditorDraft({})}>
            <PlusIcon size={15} />
            写评价
          </Button>
        </div>
      </GlassCard>

      {/* 两大主分类切换：全部 | 公共选修课 | 体育选课 */}
      <div className="glass-thin grid grid-cols-3 rounded-full p-1" role="tablist" aria-label="选修课分类">
        {(
          [
            { id: undefined, label: '全部选修' },
            { id: 'general_elective', label: '公共选修课' },
            { id: 'pe', label: '体育选课' },
          ] as const
        ).map((item) => {
          const active = category === item.id;
          return (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectCategory(item.id)}
              className={`relative rounded-full py-2 text-xs font-medium transition-colors sm:text-sm ${
                active ? 'font-semibold text-accent-fg' : 'text-fg-muted'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="elective-cat-pill"
                  className="absolute inset-0 rounded-full bg-accent shadow-sm"
                  transition={spring.snappy}
                />
              )}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 搜索 + 子模块 + 排序 + 快捷标签 */}
      <div className="space-y-2.5">
        <div className="glass-thin flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
          <SearchIcon size={16} className="shrink-0 text-fg-muted" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            placeholder={
              category === 'pe'
                ? '搜体育项目或老师（羽毛球 / 游泳 / 瑜伽 / 飞镖…）'
                : '搜公选课名、老师、课号或标签（岭南衣裳 / 美育 / 不点名…）'
            }
            className="w-full bg-transparent text-sm outline-none placeholder:text-fg-muted/75"
          />
          {keyword && (
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setPage(1);
              }}
              aria-label="清空搜索"
              className="text-fg-muted hover:text-fg"
            >
              <XIcon size={15} />
            </button>
          )}
        </div>

        {/* 子模块快捷筛选 */}
        {subChips && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSubCategory(undefined);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !subCategory ? 'bg-accent text-accent-fg' : 'glass-thin text-fg-muted hover:text-fg'
              }`}
            >
              全部模块
            </button>
            {subChips.map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => {
                  setSubCategory(subCategory === sub ? undefined : sub);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  subCategory === sub ? 'bg-accent text-accent-fg' : 'glass-thin text-fg-muted hover:text-fg'
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* 排序 + 只看已评 + 热门标签 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {SORT_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSort(item.id);
                  setPage(1);
                }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  sort === item.id ? 'bg-accent/18 font-semibold text-accent' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setOnlyReviewed((v) => !v);
                setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                onlyReviewed ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted hover:text-fg'
              }`}
            >
              仅看有评价
            </button>
          </div>

          <div className="flex flex-wrap gap-1">
            {QUICK_FILTER_TAGS.map((t) => {
              const active = tag === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTag(active ? undefined : t);
                    setPage(1);
                  }}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    active ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted hover:text-fg'
                  }`}
                >
                  #{t}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 课程卡片列表 */}
      {coursesQuery.isPending && items.length === 0 ? (
        <CardSkeleton rows={4} />
      ) : items.length === 0 ? (
        <GlassCard className="space-y-3 p-6 text-center">
          <p className="text-sm font-medium">没有找到匹配的公共选修课或体育选课</p>
          <p className="text-xs text-fg-muted">
            可以直接发布新课程评价，或者点击「导入目录」把本学期教务全校公选课一键同步进来
          </p>
          <div className="flex justify-center gap-2 pt-1">
            <Button variant="ghost" className="h-9 px-3.5 text-xs" onClick={() => setCatalogSyncOpen(true)}>
              同步/导入公选目录
            </Button>
            <Button className="h-9 px-3.5 text-xs" onClick={() => setEditorDraft({})}>
              写课程评价
            </Button>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((course) => {
              const campusLabel = CAMPUSES.find((c) => c.id === course.campusId)?.name ?? course.campusId;
              const hasReviews = course.reviewCount > 0;
              return (
                <GlassCard key={course.id} className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className="flex h-full w-full flex-col justify-between gap-3 p-4 text-left transition-opacity hover:opacity-90"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-[16px] font-bold">{course.courseName}</h3>
                          {course.subCategory && (
                            <span className="shrink-0 rounded-full bg-current/8 px-2 py-0.5 text-[10px] font-medium text-fg-muted">
                              {course.subCategory}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
                          <span className="font-semibold text-fg">{course.teacherName}</span>
                          <span>·</span>
                          <span>{SHARED_COURSE_CATEGORY_LABELS[course.category]}</span>
                          {course.credits ? <span>· {course.credits}分</span> : null}
                          <span>· {campusLabel}</span>
                        </p>
                      </div>

                      {hasReviews ? (
                        <div className="shrink-0 text-right">
                          <p className="font-num text-2xl font-bold leading-none text-accent tabular-nums">
                            {course.ratingOverall.toFixed(1)}
                          </p>
                          <p className="mt-1 font-num text-[10px] text-fg-muted tabular-nums">
                            {course.reviewCount} 条评价
                          </p>
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-medium text-accent">
                          待首评
                        </span>
                      )}
                    </div>

                    {hasReviews ? (
                      <>
                        <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                          <div className="surface-subtle rounded-xl py-1.5">
                            <span className="text-fg-muted">给分 </span>
                            <strong className="font-num tabular-nums">{course.ratingGrading.toFixed(1)}</strong>
                          </div>
                          <div className="surface-subtle rounded-xl py-1.5">
                            <span className="text-fg-muted">轻松 </span>
                            <strong className="font-num tabular-nums">{course.ratingWorkload.toFixed(1)}</strong>
                          </div>
                          <div className="surface-subtle rounded-xl py-1.5">
                            <span className="text-fg-muted">讲课 </span>
                            <strong className="font-num tabular-nums">{course.ratingQuality.toFixed(1)}</strong>
                          </div>
                        </div>

                        {course.topTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {course.topTags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-fg-muted">
                        点此查看详情并写下第一条真实选课评价，帮大家排雷选好课
                      </p>
                    )}
                  </button>
                </GlassCard>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <Button
                variant="ghost"
                className="h-9 px-3.5 text-xs"
                disabled={page <= 1 || coursesQuery.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <span className="font-num text-xs text-fg-muted tabular-nums">
                第 {page} / {totalPages} 页 · 共 {total} 门
              </span>
              <Button
                variant="ghost"
                className="h-9 px-3.5 text-xs"
                disabled={!hasMore || coursesQuery.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}

      <CourseReviewDetailSheet
        courseId={selectedCourseId}
        onClose={() => setSelectedCourseId(null)}
        onWriteReview={(course, myReview) => {
          setSelectedCourseId(null);
          setEditorDraft({ course, myReview });
        }}
      />

      <CourseReviewEditorSheet
        draft={editorDraft}
        onClose={() => setEditorDraft(null)}
        onSaved={(courseId) => setSelectedCourseId(courseId)}
      />

      <ElectiveCatalogSyncSheet open={catalogSyncOpen} onClose={() => setCatalogSyncOpen(false)} />
    </div>
  );
}
