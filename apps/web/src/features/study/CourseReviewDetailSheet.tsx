import {
  CAMPUSES,
  COURSE_ATTENDANCE_LABELS,
  COURSE_ATTENDANCE_LEVELS,
  COURSE_EXAM_FORMAT_LABELS,
  COURSE_EXAM_FORMATS,
  SHARED_COURSE_CATEGORY_LABELS,
  type CourseReviewItem,
  type SharedCourse,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/Button';
import { Sheet } from '../../components/Sheet';
import { CardSkeleton } from '../../components/Skeleton';
import { api, ApiError } from '../../lib/api';
import { keys, useSharedCourseDetail } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

interface CourseReviewDetailSheetProps {
  courseId: string | null;
  onClose: () => void;
  onWriteReview: (course: SharedCourse, myReview: CourseReviewItem | null) => void;
}

export function CourseReviewDetailSheet({ courseId, onClose, onWriteReview }: CourseReviewDetailSheetProps) {
  const qc = useQueryClient();
  const detailQuery = useSharedCourseDetail(courseId);
  const data = detailQuery.data;

  const likeMutation = useMutation({
    mutationFn: (reviewId: string) =>
      api<{ liked: boolean; likeCount: number }>(`/course-reviews/reviews/${reviewId}/like`, { method: 'POST' }),
    onSuccess: async () => {
      if (courseId) await qc.invalidateQueries({ queryKey: keys.sharedCourseDetail(courseId) });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '操作失败'),
  });

  const deleteMyMutation = useMutation({
    mutationFn: () => api(`/course-reviews/courses/${courseId}/review`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.sharedCoursesPrefix });
      if (courseId) await qc.invalidateQueries({ queryKey: keys.sharedCourseDetail(courseId) });
      toast.success('已删除你的评价');
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '删除失败'),
  });

  const campusName = data?.course
    ? (CAMPUSES.find((c) => c.id === data.course.campusId)?.name ?? data.course.campusId)
    : '';

  const totalAtt = data
    ? COURSE_ATTENDANCE_LEVELS.reduce((s, k) => s + data.attendanceStats[k], 0)
    : 0;

  return (
    <Sheet
      open={Boolean(courseId)}
      onClose={onClose}
      title={data ? `${data.course.courseName} · ${data.course.teacherName}` : '课程评价详情'}
    >
      {detailQuery.isPending && !data ? (
        <CardSkeleton rows={3} />
      ) : !data ? (
        <p className="py-6 text-center text-sm text-fg-muted">未找到该课程评价信息</p>
      ) : (
        <div className="space-y-4 pb-2">
          {/* 课程概览与四维均分 */}
          <div className="surface-subtle space-y-3 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-fg-muted">
                  {SHARED_COURSE_CATEGORY_LABELS[data.course.category]} · {campusName}
                  {data.course.credits ? ` · ${data.course.credits} 学分` : ''}
                  {data.course.department ? ` · ${data.course.department}` : ''}
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-num text-3xl font-bold text-accent tabular-nums">
                    {data.course.reviewCount > 0 ? data.course.ratingOverall.toFixed(1) : '—'}
                  </span>
                  <span className="text-xs text-fg-muted">
                    综合推荐 · 共 {data.course.reviewCount} 条同学评价
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <Button
                  className="h-9 px-3 text-xs"
                  onClick={() => onWriteReview(data.course, data.myReview)}
                >
                  {data.myReview ? '修改我的评价' : '我也要评'}
                </Button>
                {data.myReview && (
                  <Button
                    variant="ghost"
                    className="h-9 px-2.5 text-xs text-danger"
                    loading={deleteMyMutation.isPending}
                    onClick={() => deleteMyMutation.mutate()}
                  >
                    删评
                  </Button>
                )}
              </div>
            </div>

            {data.course.reviewCount > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-xl bg-white/15 px-2 py-2 dark:bg-black/15">
                  <p className="text-[11px] text-fg-muted">给分友好</p>
                  <p className="mt-0.5 font-num text-base font-bold tabular-nums">{data.course.ratingGrading.toFixed(1)}</p>
                </div>
                <div className="rounded-xl bg-white/15 px-2 py-2 dark:bg-black/15">
                  <p className="text-[11px] text-fg-muted">任务轻松</p>
                  <p className="mt-0.5 font-num text-base font-bold tabular-nums">{data.course.ratingWorkload.toFixed(1)}</p>
                </div>
                <div className="rounded-xl bg-white/15 px-2 py-2 dark:bg-black/15">
                  <p className="text-[11px] text-fg-muted">授课质量</p>
                  <p className="mt-0.5 font-num text-base font-bold tabular-nums">{data.course.ratingQuality.toFixed(1)}</p>
                </div>
              </div>
            )}

            {/* 点名与考核方式共识 */}
            {totalAtt > 0 && (
              <div className="space-y-1.5 border-t border-current/8 pt-2.5 text-xs text-fg-muted">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-fg">点名统计：</span>
                  {COURSE_ATTENDANCE_LEVELS.filter((k) => data.attendanceStats[k] > 0).map((k) => (
                    <span key={k} className="rounded-full bg-current/8 px-2 py-0.5 text-[11px]">
                      {COURSE_ATTENDANCE_LABELS[k]} {Math.round((data.attendanceStats[k] / totalAtt) * 100)}%
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-fg">考核方式：</span>
                  {COURSE_EXAM_FORMATS.filter((k) => data.examFormatStats[k] > 0).map((k) => (
                    <span key={k} className="rounded-full bg-current/8 px-2 py-0.5 text-[11px]">
                      {COURSE_EXAM_FORMAT_LABELS[k]} ({data.examFormatStats[k]})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 同学评价列表 */}
          <div className="space-y-2.5">
            <h3 className="px-1 text-xs font-semibold text-fg-muted">全部选课评价 ({data.reviews.length})</h3>
            {data.reviews.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">暂时还没有评价，快来写第一条参考吧</p>
            ) : (
              data.reviews.map((rev) => (
                <article key={rev.id} className="surface-subtle space-y-2 rounded-2xl p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs">
                      <span className="truncate font-semibold">{rev.authorNickname}</span>
                      {rev.isMine && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                          我的评价
                        </span>
                      )}
                      {rev.semesterTaken && <span className="text-[11px] text-fg-muted">· {rev.semesterTaken}</span>}
                    </div>
                    <span className="shrink-0 font-num text-xs font-bold text-accent tabular-nums">
                      综合 {rev.scoreOverall}.0
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-muted">
                    <span>给分 {rev.scoreGrading}</span>
                    <span>·</span>
                    <span>轻松 {rev.scoreWorkload}</span>
                    <span>·</span>
                    <span>讲课 {rev.scoreQuality}</span>
                    <span>·</span>
                    <span className="rounded-full bg-current/8 px-2 py-0.5 text-fg">
                      {COURSE_ATTENDANCE_LABELS[rev.attendance]}
                    </span>
                    <span className="rounded-full bg-current/8 px-2 py-0.5 text-fg">
                      {COURSE_EXAM_FORMAT_LABELS[rev.examFormat]}
                    </span>
                  </div>

                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{rev.content}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap gap-1">
                      {rev.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent"
                        >
                          {t}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => likeMutation.mutate(rev.id)}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        rev.likedByMe
                          ? 'bg-accent text-accent-fg'
                          : 'bg-current/8 text-fg-muted hover:text-fg'
                      }`}
                    >
                      <span>有用</span>
                      <span className="font-num tabular-nums">{rev.likeCount}</span>
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
