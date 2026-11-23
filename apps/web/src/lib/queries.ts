import {
  DEFAULT_CAMPUS_ID,
  defaultAcademicYear,
  type CurrentFitnessData,
  type DiningContext,
  type ExamData,
  type FitnessData,
  type GradeData,
  type MealFeedback,
  type MealRecommendationResponse,
  type MealType,
  type Merchant,
  type MerchantCategory,
  type MerchantReviewsResponse,
  type MerchantStatus,
  type MoodLog,
  type NotificationPage,
  type RankingResponse,
  type RankingType,
  type TimetableData,
  type Todo,
  type UserPreference,
  type WeatherReport,
} from '@gduthelp/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth-store';

export const keys = {
  weather: (campusId: string | null) => ['weather', campusId] as const,
  timetable: ['timetable'] as const,
  exams: ['exams'] as const,
  fitness: ['fitness'] as const,
  fitnessCurrent: (academicYear?: string) => ['fitness', 'current', academicYear ?? defaultAcademicYear()] as const,
  grades: ['grades'] as const,
  todos: ['todos'] as const,
  notifications: ['notifications'] as const,
  preferences: ['preferences'] as const,
  moodToday: ['mood', 'today'] as const,
  recommendations: (meal: MealType, exclude: string[], ctx?: DiningContext) =>
    ['recommend', 'meals', meal, exclude.join(','), ctx?.party ?? '', ctx?.pace ?? ''] as const,
  recommendationsPrefix: ['recommend', 'meals'] as const,
  merchants: (campusId: string, category?: MerchantCategory, q?: string) => ['merchants', campusId, category ?? '', q ?? ''] as const,
  merchantsPrefix: ['merchants'] as const,
  mealHistory: ['recommend', 'history'] as const,
  adminMerchants: (status?: MerchantStatus) => ['admin', 'merchants', status ?? 'all'] as const,
  adminMerchantsPrefix: ['admin', 'merchants'] as const,
  rankings: (campusId: string, type: RankingType, category?: MerchantCategory) =>
    ['rankings', campusId, type, category ?? ''] as const,
  rankingsPrefix: ['rankings'] as const,
  merchantReviews: (merchantId: string) => ['merchant-reviews', merchantId] as const,
};

const useLoggedIn = () => useAuth((s) => s.status === 'authenticated');

export function useWeather() {
  const campusId = useAuth((s) => s.user?.campusId ?? null);
  return useQuery({
    queryKey: keys.weather(campusId),
    queryFn: () => api<WeatherReport>('/weather'),
    enabled: useLoggedIn(),
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export function useTimetable() {
  return useQuery({
    queryKey: keys.timetable,
    queryFn: () => api<TimetableData>('/timetable'),
    enabled: useLoggedIn(),
    staleTime: 5 * 60_000,
  });
}

export function useExams() {
  return useQuery({
    queryKey: keys.exams,
    queryFn: () => api<ExamData>('/exams'),
    enabled: useLoggedIn(),
    staleTime: 5 * 60_000,
  });
}

export function useFitnessRecords() {
  return useQuery({
    queryKey: keys.fitness,
    queryFn: () => api<FitnessData>('/fitness'),
    enabled: useLoggedIn(),
    staleTime: 5 * 60_000,
  });
}

export function useCurrentFitness(academicYear?: string) {
  const year = academicYear ?? defaultAcademicYear();
  return useQuery({
    queryKey: keys.fitnessCurrent(year),
    queryFn: () => api<CurrentFitnessData>(`/fitness/current?academicYear=${encodeURIComponent(year)}`),
    enabled: useLoggedIn(),
    staleTime: 2 * 60_000,
  });
}

export function useGrades() {
  return useQuery({
    queryKey: keys.grades,
    queryFn: () => api<GradeData>('/grades'),
    enabled: useLoggedIn(),
    staleTime: 2 * 60_000,
  });
}

export function useTodos() {
  return useQuery({ queryKey: keys.todos, queryFn: () => api<Todo[]>('/todos'), enabled: useLoggedIn() });
}

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<NotificationPage>('/notifications'),
    enabled: useLoggedIn(),
    refetchInterval: 60_000,
  });
}

export function usePreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: () => api<UserPreference>('/me/preferences'),
    enabled: useLoggedIn(),
    staleTime: 5 * 60_000,
  });
}

export function useTodayMood() {
  return useQuery({
    queryKey: keys.moodToday,
    queryFn: () => api<MoodLog | null>('/mood/today'),
    enabled: useLoggedIn(),
    staleTime: 60_000,
  });
}

export function useMealRecommendations(meal: MealType, excludeIds: string[] = [], context?: DiningContext) {
  const qs = new URLSearchParams({ meal });
  if (excludeIds.length) qs.set('exclude', excludeIds.join(','));
  if (context?.party) qs.set('party', context.party);
  if (context?.pace) qs.set('pace', context.pace);
  return useQuery({
    queryKey: keys.recommendations(meal, excludeIds, context),
    queryFn: () => api<MealRecommendationResponse>(`/recommend/meals?${qs.toString()}`),
    enabled: useLoggedIn(),
    staleTime: 2 * 60_000,
  });
}

export function useMerchants(category?: MerchantCategory, q?: string) {
  const campusId = useAuth((s) => s.user?.campusId ?? DEFAULT_CAMPUS_ID);
  const qs = new URLSearchParams({ campusId });
  if (category) qs.set('category', category);
  if (q?.trim()) qs.set('q', q.trim());
  return useQuery({
    queryKey: keys.merchants(campusId, category, q?.trim()),
    queryFn: () => api<Merchant[]>(`/merchants?${qs.toString()}`),
    enabled: useLoggedIn(),
    staleTime: 60_000,
  });
}

export function useMealHistory() {
  return useQuery({
    queryKey: keys.mealHistory,
    queryFn: () => api<MealFeedback[]>('/recommend/history'),
    enabled: useLoggedIn(),
    staleTime: 60_000,
  });
}

export function useAdminMerchants(status?: MerchantStatus) {
  const isAdmin = useAuth((s) => s.status === 'authenticated' && s.user?.role === 'admin');
  const qs = status ? `?status=${status}` : '';
  return useQuery({
    queryKey: keys.adminMerchants(status),
    queryFn: () => api<Merchant[]>(`/admin/merchants${qs}`),
    enabled: isAdmin,
  });
}

export function useRankings(type: RankingType, category?: MerchantCategory) {
  const campusId = useAuth((s) => s.user?.campusId ?? DEFAULT_CAMPUS_ID);
  const qs = new URLSearchParams({ type, campusId });
  if (type === 'category' && category) qs.set('category', category);
  return useQuery({
    queryKey: keys.rankings(campusId, type, type === 'category' ? category : undefined),
    queryFn: () => api<RankingResponse>(`/rankings?${qs.toString()}`),
    enabled: useLoggedIn(),
    staleTime: 60_000,
  });
}

export function useMerchantReviews(merchantId: string | null) {
  return useQuery({
    queryKey: keys.merchantReviews(merchantId ?? ''),
    queryFn: () => api<MerchantReviewsResponse>(`/merchants/${merchantId}/reviews`),
    enabled: useLoggedIn() && Boolean(merchantId),
  });
}
