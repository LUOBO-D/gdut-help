import type {
  Dish,
  DishInput,
  MealFeedback,
  MealFeedbackInput,
  Merchant,
  MerchantInput,
  MerchantUpdateInput,
  MoodInput,
  MoodLog,
  SeedImportResult,
  UserPreference,
  UserPreferenceInput,
} from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { keys } from '../../lib/queries';

export function useSaveMood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MoodInput) => api<MoodLog>('/mood/today', { method: 'PUT', body: input }),
    onSuccess: (mood) => {
      qc.setQueryData(keys.moodToday, mood);
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UserPreferenceInput) => api<UserPreference>('/me/preferences', { method: 'PUT', body: input }),
    onSuccess: (pref) => {
      qc.setQueryData(keys.preferences, pref);
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useSendMealFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MealFeedbackInput) => api<MealFeedback>('/recommend/feedback', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.mealHistory });
    },
  });
}

export function useCreateMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MerchantInput) => api<Merchant>('/merchants', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
    },
  });
}

export function useUpdateMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MerchantUpdateInput }) =>
      api<Merchant>(`/merchants/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
    },
  });
}

export function useDeleteMerchant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<null>(`/merchants/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
    },
  });
}

export function useAddDish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ merchantId, data }: { merchantId: string; data: DishInput }) =>
      api<Dish>(`/merchants/${merchantId}/dishes`, { method: 'POST', body: data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
    },
  });
}

export function useRemoveDish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ merchantId, dishId }: { merchantId: string; dishId: string }) =>
      api<null>(`/merchants/${merchantId}/dishes/${dishId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
    },
  });
}

export function useAdminMerchantAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' | 'close' }) =>
      api<Merchant>(`/admin/merchants/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useSeedHemcMerchants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SeedImportResult>('/merchants/seed-hemc', { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
      void qc.invalidateQueries({ queryKey: keys.adminMerchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.rankingsPrefix });
    },
  });
}
