/**
 * 广工第二课堂（素质拓展 / Better Me / 网上办事大厅）直连查询工具（仅安卓原生端使用）。
 *
 * 复用 gdut-auth.ts 统一认证网关：支持 CAS 静默续期、持久化 Cookie，在「我的」登录一次即可共用。
 */
import {
  connectGdutAuth,
  EHALL_ORIGIN,
  GdutAuthRequired,
  gdutRequest,
  JW_ORIGIN,
} from './gdut-auth';

export const SecondClassLoginRequired = GdutAuthRequired;

export function loginToSecondClass(): Promise<boolean> {
  return connectGdutAuth({ targetOrigin: EHALL_ORIGIN });
}

/** 探测广工教务 / 办事大厅第二课堂（素拓）接口，返回原始 JSON/HTML 文本供 shared 解析 */
export async function fetchSecondClassRawPayload(): Promise<string> {
  const probes: { origin: string; path: string; data: Record<string, string> }[] = [
    { origin: JW_ORIGIN, path: '/xsktxx!getDataList.action', data: { page: '1', rows: '100' } },
    { origin: JW_ORIGIN, path: '/xsdekt!getDataList.action', data: { page: '1', rows: '100' } },
    { origin: JW_ORIGIN, path: '/sztz!getDataList.action', data: { page: '1', rows: '100' } },
    { origin: EHALL_ORIGIN, path: '/xsfw/sys/dektapp/modules/wdhd/wdhd.do', data: { pageNumber: '1', pageSize: '100' } },
    { origin: EHALL_ORIGIN, path: '/xsfw/sys/sztzapp/modules/wdhd/wdhd.do', data: { pageNumber: '1', pageSize: '100' } },
  ];

  let sawAuthRequired = false;

  for (const probe of probes) {
    try {
      const res = await gdutRequest(probe.origin, probe.path, { method: 'POST', data: probe.data });
      if (res.status >= 400) continue;
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      if (/hdmc|xmmc|活动名称|学时|时长|服务时长|第二课堂/i.test(body)) {
        return body;
      }
    } catch (err) {
      if (err instanceof GdutAuthRequired) {
        sawAuthRequired = true;
      }
    }
  }

  if (sawAuthRequired) throw new GdutAuthRequired('广工第二课堂会话已过期，请重新完成统一认证');
  return '';
}
