import {
  CAMPUSES,
  COURSE_ATTENDANCE_LABELS,
  COURSE_ATTENDANCE_LEVELS,
  COURSE_EXAM_FORMAT_LABELS,
  COURSE_EXAM_FORMATS,
  COURSE_REVIEW_PRESET_TAGS,
  DEFAULT_CAMPUS_ID,
  defaultSemesterCode,
  detectElectiveCategory,
  formatSemesterName,
  PE_SUBCATEGORIES,
  PUBLIC_ELECTIVE_SUBCATEGORIES,
  SHARED_COURSE_CATEGORIES,
  SHARED_COURSE_CATEGORY_LABELS,
  type CourseAttendanceLevel,
  type CourseExamFormat,
  type CourseReviewItem,
  type SharedCourse,
  type SharedCourseCategory,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Sheet } from '../../components/Sheet';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';
import { keys, useGrades, useTimetable } from '../../lib/queries';
import { toast } from '../../lib/toast-store';

export interface CourseReviewDraft {
  /** 已有共享选修课（追加/编辑评价）；为空表示投稿新课程并发表评价 */
  course?: SharedCourse;
  /** 本人已有评价（用于编辑） */
  myReview?: CourseReviewItem | null;
  /** 预填信息 */
  prefill?: {
    courseName: string;
    teacherName?: string;
    credits?: number | null;
    category?: SharedCourseCategory;
    subCategory?: string | null;
  };
}

interface CourseReviewEditorSheetProps {
  draft: CourseReviewDraft | null;
  onClose: () => void;
  onSaved?: (courseId: string) => void;
}

export function CourseReviewEditorSheet({ draft, onClose, onSaved }: CourseReviewEditorSheetProps) {
  const title = draft?.course
    ? draft.myReview
      ? '修改我的选课评价'
      : `评价「${draft.course.courseName}」`
    : '发布选课评价（全校共享）';
  return (
    <Sheet open={Boolean(draft)} onClose={onClose} title={title}>
      {draft && <CourseReviewForm draft={draft} onClose={onClose} onSaved={onSaved} />}
    </Sheet>
  );
}

function CourseReviewForm({
  draft,
  onClose,
  onSaved,
}: {
  draft: CourseReviewDraft;
  onClose: () => void;
  onSaved?: (courseId: string) => void;
}) {
  const qc = useQueryClient();
  const userCampus = useAuth((s) => s.user?.campusId ?? DEFAULT_CAMPUS_ID);
  const timetable = useTimetable().data;
  const grades = useGrades().data?.grades;

  const lockedCourse = draft.course;
  const existing = draft.myReview;

  const [courseName, setCourseName] = useState(lockedCourse?.courseName ?? draft.prefill?.courseName ?? '');
  const [teacherName, setTeacherName] = useState(lockedCourse?.teacherName ?? draft.prefill?.teacherName ?? '');
  const [campusId, setCampusId] = useState(lockedCourse?.campusId ?? userCampus);
  const [category, setCategory] = useState<SharedCourseCategory>(
    lockedCourse?.category ?? draft.prefill?.category ?? 'general_elective',
  );
  const [subCategory, setSubCategory] = useState(lockedCourse?.subCategory ?? draft.prefill?.subCategory ?? '');
  const [department, setDepartment] = useState(lockedCourse?.department ?? '');
  const [credits, setCredits] = useState(
    lockedCourse?.credits != null
      ? String(lockedCourse.credits)
      : draft.prefill?.credits != null
        ? String(draft.prefill.credits)
        : '',
  );

  const [scoreOverall, setScoreOverall] = useState(existing?.scoreOverall ?? 5);
  const [scoreGrading, setScoreGrading] = useState(existing?.scoreGrading ?? 5);
  const [scoreWorkload, setScoreWorkload] = useState(existing?.scoreWorkload ?? 4);
  const [scoreQuality, setScoreQuality] = useState(existing?.scoreQuality ?? 4);
  const [attendance, setAttendance] = useState<CourseAttendanceLevel>(existing?.attendance ?? 'occasional');
  const [examFormat, setExamFormat] = useState<CourseExamFormat>(existing?.examFormat ?? 'paper');
  const [semesterTaken, setSemesterTaken] = useState(existing?.semesterTaken ?? formatSemesterName(defaultSemesterCode()));
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [content, setContent] = useState(existing?.content ?? '');
  const [anonymous, setAnonymous] = useState(existing?.anonymous ?? false);

  const subOptions = category === 'pe' ? PE_SUBCATEGORIES : PUBLIC_ELECTIVE_SUBCATEGORIES;

  // 优先从本人课表与成绩中筛选出「公共选修课」与「体育选课」供 1 键填入
  const myElectivePicks: {
    courseName: string;
    teacherName: string;
    credits: number | null;
    category: SharedCourseCategory;
    subCategory: string | null;
  }[] = [];
  if (!lockedCourse) {
    const seen = new Set<string>();
    for (const c of timetable?.courses ?? []) {
      const det = detectElectiveCategory({ courseName: c.name });
      if (!det) continue;
      const key = `${c.name}|${c.teacher ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      myElectivePicks.push({
        courseName: c.name,
        teacherName: c.teacher ?? '',
        credits: det.category === 'pe' ? 1 : 2,
        category: det.category,
        subCategory: det.subCategory,
      });
      if (myElectivePicks.length >= 6) break;
    }
    if (myElectivePicks.length < 6) {
      for (const g of grades ?? []) {
        const det = detectElectiveCategory({ courseName: g.courseName, courseType: g.courseType });
        if (!det) continue;
        const key = `${g.courseName}|`;
        if (seen.has(key)) continue;
        seen.add(key);
        myElectivePicks.push({
          courseName: g.courseName,
          teacherName: '',
          credits: g.credits,
          category: det.category,
          subCategory: det.subCategory,
        });
        if (myElectivePicks.length >= 6) break;
      }
    }
  }

  const toggleTag = (tag: string) => {
    setTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 6) {
        toast.info('最多选择 6 个标签');
        return prev;
      }
      return [...prev, tag];
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const reviewBody = {
        scoreOverall,
        scoreGrading,
        scoreWorkload,
        scoreQuality,
        attendance,
        examFormat,
        semesterTaken: semesterTaken.trim() || null,
        tags,
        content: content.trim(),
        anonymous,
      };
      if (lockedCourse) {
        return api<{ course: SharedCourse; review: CourseReviewItem }>(
          `/course-reviews/courses/${lockedCourse.id}/review`,
          { method: 'PUT', body: reviewBody },
        );
      }
      return api<{ course: SharedCourse; review: CourseReviewItem }>('/course-reviews/courses', {
        method: 'POST',
        body: {
          ...reviewBody,
          courseName: courseName.trim(),
          teacherName: teacherName.trim(),
          campusId,
          category,
          subCategory: subCategory.trim() || null,
          department: department.trim() || null,
          credits: credits.trim() ? Number(credits) : null,
        },
      });
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: keys.sharedCoursesPrefix });
      await qc.invalidateQueries({ queryKey: keys.sharedCourseDetail(res.course.id) });
      toast.success(existing ? '已更新你的选课评价' : '已发布到全校选课共享库，感谢分享！');
      onClose();
      onSaved?.(res.course.id);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : '提交评价失败'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!lockedCourse && (!courseName.trim() || !teacherName.trim())) {
      toast.error('请填写课程名称和任课老师');
      return;
    }
    if (content.trim().length < 2) {
      toast.error('请至少写 2 个字的选课真实感受');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-2">
      {lockedCourse ? (
        <div className="surface-subtle rounded-2xl px-3.5 py-2.5">
          <p className="text-sm font-semibold">
            {lockedCourse.courseName} · <span className="text-accent">{lockedCourse.teacherName}</span>
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {SHARED_COURSE_CATEGORY_LABELS[lockedCourse.category]}
            {lockedCourse.subCategory ? ` · ${lockedCourse.subCategory}` : ''}
            {lockedCourse.credits ? ` · ${lockedCourse.credits} 学分` : ''}
          </p>
        </div>
      ) : (
        <>
          {myElectivePicks.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">从我的公选/体育课快捷填入</p>
              <div className="flex flex-wrap gap-1.5">
                {myElectivePicks.map((item) => (
                  <button
                    key={`${item.courseName}-${item.teacherName}`}
                    type="button"
                    onClick={() => {
                      setCourseName(item.courseName);
                      if (item.teacherName) setTeacherName(item.teacherName);
                      if (item.credits != null) setCredits(String(item.credits));
                      setCategory(item.category);
                      setSubCategory(item.subCategory ?? '');
                    }}
                    className="surface-subtle surface-subtle-hover rounded-full px-2.5 py-1 text-xs text-fg"
                  >
                    {item.courseName}
                    {item.teacherName ? ` (${item.teacherName})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 严格两分类：公共选修课 / 体育选课 */}
          <div>
            <p className="mb-1.5 text-sm text-fg-muted">选修课分类</p>
            <div className="grid grid-cols-2 gap-2">
              {SHARED_COURSE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setCategory(cat);
                    setSubCategory('');
                  }}
                  className={`rounded-2xl py-2.5 text-sm font-semibold transition-colors ${
                    category === cat ? 'bg-accent text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted'
                  }`}
                >
                  {SHARED_COURSE_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="课程名称">
              <input
                className="field"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder={category === 'pe' ? '例如：体育（羽毛球）' : '例如：岭南衣裳 / 电影赏析'}
                required
              />
            </Field>
            <Field label="任课教师">
              <input
                className="field"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="例如：张老师"
                required
              />
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-sm text-fg-muted">细分模块（可选）</p>
            <div className="flex flex-wrap gap-1.5">
              {subOptions.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSubCategory(subCategory === sub ? '' : sub)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    subCategory === sub ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted'
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="开课校区">
              <select value={campusId} onChange={(e) => setCampusId(e.target.value)} className="field">
                {CAMPUSES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="学分（可选）">
              <input
                className="field"
                type="number"
                step="0.5"
                min={0.5}
                max={10}
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                placeholder={category === 'pe' ? '1' : '2'}
              />
            </Field>
          </div>

          <Field label="开课学院 / 单位（可选）">
            <input
              className="field"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder={category === 'pe' ? '体育学院' : '通识教育中心'}
            />
          </Field>
        </>
      )}

      {/* 四维打分 */}
      <div className="surface-subtle space-y-2.5 rounded-2xl p-3.5">
        <ScoreRow label="综合推荐" value={scoreOverall} onChange={setScoreOverall} />
        <ScoreRow label="给分友好" hint="5=给分极高" value={scoreGrading} onChange={setScoreGrading} />
        <ScoreRow label="任务轻松" hint="5=作业少不卷" value={scoreWorkload} onChange={setScoreWorkload} />
        <ScoreRow label="授课质量" hint="5=干货有趣" value={scoreQuality} onChange={setScoreQuality} />
      </div>

      {/* 考勤点名 + 考核方式 */}
      <div>
        <p className="mb-1.5 text-sm text-fg-muted">点名考勤情况</p>
        <div className="grid grid-cols-3 gap-1.5">
          {COURSE_ATTENDANCE_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setAttendance(lvl)}
              className={`rounded-xl py-2 text-xs font-medium transition-colors ${
                attendance === lvl ? 'bg-accent text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted'
              }`}
            >
              {COURSE_ATTENDANCE_LABELS[lvl]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm text-fg-muted">主要考核方式</p>
        <div className="flex flex-wrap gap-1.5">
          {COURSE_EXAM_FORMATS.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => setExamFormat(fmt)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                examFormat === fmt ? 'bg-accent text-accent-fg shadow-sm' : 'surface-subtle text-fg-muted'
              }`}
            >
              {COURSE_EXAM_FORMAT_LABELS[fmt]}
            </button>
          ))}
        </div>
      </div>

      {/* 高频选课标签 */}
      <div>
        <p className="mb-1.5 text-sm text-fg-muted">选课标签（可选，最多 6 个）</p>
        <div className="flex flex-wrap gap-1.5">
          {COURSE_REVIEW_PRESET_TAGS.map((t) => {
            const picked = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  picked ? 'bg-accent text-accent-fg' : 'surface-subtle text-fg-muted hover:text-fg'
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <Field label="修读学期（可选）">
        <input
          className="field"
          value={semesterTaken}
          onChange={(e) => setSemesterTaken(e.target.value)}
          placeholder="例如：2025-2026 春季"
        />
      </Field>

      <Field label="真实选课心得 / 避坑指南">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={600}
          placeholder="说说给分范围、作业量、点名方式、期末考核或体能要求，帮广工同学们选好课…"
          className="surface-subtle w-full rounded-2xl p-3 text-sm outline-none placeholder:text-fg-muted/70"
          required
        />
      </Field>

      <label className="flex cursor-pointer items-center justify-between gap-2 rounded-2xl px-1 text-xs text-fg-muted">
        <span>匿名发布（对外显示为「广工同学」，自己仍可修改或删除）</span>
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
      </label>

      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" loading={saveMutation.isPending}>
          {existing ? '保存修改' : '发布到共享库'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          取消
        </Button>
      </div>
    </form>
  );
}

function ScoreRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-xs font-semibold">{label}</span>
        {hint && <span className="ml-1.5 text-[10px] text-fg-muted">{hint}</span>}
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`grid size-7 place-items-center rounded-full font-num text-xs font-semibold transition-colors ${
              n <= value ? 'bg-accent text-accent-fg' : 'bg-current/10 text-fg-muted'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
