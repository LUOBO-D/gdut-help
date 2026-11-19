import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../lib/auth-store';

export function RequireAuth() {
  const status = useAuth((s) => s.status);
  const location = useLocation();

  if (status === 'unknown') return <Splash />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="加载中">
      <span className="size-8 animate-spin rounded-full border-[3px] border-fg-muted border-r-transparent" />
    </div>
  );
}
