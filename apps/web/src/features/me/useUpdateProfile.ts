import type { UpdateProfileRequest, UserProfile } from '@gduthelp/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-store';

export function useUpdateProfile() {
  const setUser = useAuth((s) => s.setUser);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateProfileRequest) => api<UserProfile>('/me', { method: 'PATCH', body: patch }),
    onSuccess: (user, patch) => {
      setUser(user);
      // 换校区后天气和节次时间都要按新校区刷新
      if (patch.campusId) void qc.invalidateQueries({ queryKey: ['weather'] });
    },
  });
}
