import type { NotificationPage, TimetableData, Todo, WeatherReport } from '@gduthelp/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth-store';

export const keys = {
  weather: (campusId: string | null) => ['weather', campusId] as const,
  timetable: ['timetable'] as const,
  todos: ['todos'] as const,
  notifications: ['notifications'] as const,
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
