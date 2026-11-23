import { Navigate, useSearchParams } from 'react-router';

/**
 * 兼容旧版 /scores 与 /scores?tab=fitness 书签，统一收拢至「学业 → 成绩」。
 */
export function ScoresPage() {
  const [searchParams] = useSearchParams();
  const sub = searchParams.get('tab') === 'fitness' ? '&sub=fitness' : '';
  return <Navigate to={`/study?tab=scores${sub}`} replace />;
}
