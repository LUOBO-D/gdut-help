import type { Review, ReviewInput } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { keys } from '../../lib/queries';

export function useUpsertReview(merchantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => api<Review>(`/merchants/${merchantId}/review`, { method: 'PUT', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantReviews(merchantId) });
      void qc.invalidateQueries({ queryKey: keys.rankingsPrefix });
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useDeleteReview(merchantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<null>(`/merchants/${merchantId}/review`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantReviews(merchantId) });
      void qc.invalidateQueries({ queryKey: keys.rankingsPrefix });
      void qc.invalidateQueries({ queryKey: keys.merchantsPrefix });
      void qc.invalidateQueries({ queryKey: keys.recommendationsPrefix });
    },
  });
}

export function useToggleReviewLike(merchantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) =>
      api<{ liked: boolean; likeCount: number }>(`/reviews/${reviewId}/like`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.merchantReviews(merchantId) });
      void qc.invalidateQueries({ queryKey: keys.rankingsPrefix });
    },
  });
}
