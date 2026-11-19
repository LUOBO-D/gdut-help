import { ComingSoon } from '../../components/ComingSoon';
import { PageHeader } from '../../components/PageHeader';

export function FoodPage() {
  return (
    <>
      <PageHeader title="吃什么" subtitle="根据天气、课表和心情推荐" />
      <ComingSoon
        stage="S3"
        items={['记录今日心情', '午餐、晚餐各推荐 3 个候选，附推荐理由', '「换一批」和「不想吃」反馈', '提交商家（查重后直接上架）']}
      />
    </>
  );
}
