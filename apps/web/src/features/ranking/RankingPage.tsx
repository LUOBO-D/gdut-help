import { ComingSoon } from '../../components/ComingSoon';
import { PageHeader } from '../../components/PageHeader';

export function RankingPage() {
  return (
    <>
      <PageHeader title="榜单" subtitle="大家给商家的评分" />
      <ComingSoon stage="S4" items={['多维度评分与评论', '综合榜、分类榜、本周热门', '3D 领奖台']} />
    </>
  );
}
