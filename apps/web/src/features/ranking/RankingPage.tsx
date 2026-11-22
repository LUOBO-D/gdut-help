import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { RankingContent } from './RankingContent';

export function RankingPage() {
  return (
    <>
      <PageHeader
        title="榜单"
        subtitle="贝叶斯加权防刷榜，真实口碑一目了然"
        action={
          <Link to="/food" className="glass-thin inline-flex h-10 items-center rounded-2xl px-3.5 text-sm font-medium">
            去吃什么
          </Link>
        }
      />
      <RankingContent />
    </>
  );
}
