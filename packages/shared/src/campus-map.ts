/**
 * 广东工业大学（大学城校区）限定校园地图数据、坐标投影、教室模糊匹配与 A* 校内路径规划。
 *
 * 坐标系：采用 WGS-84 经纬度（与手机 GPS / OpenStreetMap 零偏移对齐），
 * 经由 `latLngToLocal` 投影为以校园中心为原点的本地米制 3D 坐标（+x 东，+z 南，-z 北）。
 */

export type CampusZone = 'west' | 'east' | 'teaching' | 'lab' | 'landmark' | 'sports' | 'canteen' | 'gate';

export type BuildingCategory = 'all' | 'teaching' | 'lab' | 'dorm-west' | 'dorm-east' | 'canteen' | 'landmark' | 'sports';

export const BUILDING_CATEGORY_LABELS: Record<BuildingCategory, string> = {
  all: '全部',
  teaching: '教学/大教室',
  lab: '工学/实验楼',
  'dorm-west': '生活西区',
  'dorm-east': '生活东区',
  canteen: '饭堂/服务',
  landmark: '图书馆/综合',
  sports: '文体/南亭',
};

export type BuildingShape = 'box' | 'courtyard' | 'semicircle' | 'dome' | 'stadium' | 'matrix' | 'tiered' | 'gate';

export interface CampusBuilding {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
  category: Exclude<BuildingCategory, 'all'>;
  zone: CampusZone;
  lat: number;
  lng: number;
  /** 3D 模型尺寸（米）：东西宽、南北深、楼高 */
  width: number;
  depth: number;
  height: number;
  /** 绕 Y 轴旋转角度（弧度，可选） */
  rotation?: number;
  shape?: BuildingShape;
  /** 标签显示优先级：1 总是显示，2 中近景显示，3 近景显示 */
  priority: 1 | 2 | 3;
  /** 关联最近的校内路网节点 ID */
  roadNodeId: string;
  /** 给大一/大二同学的一句话防迷路提示 */
  tip: string;
  /** 入口提示 */
  entrance?: string;
}

export interface CampusRoadNode {
  id: string;
  lat: number;
  lng: number;
  label?: string;
}

export type RouteMode = 'walk' | 'bike';

export interface CampusRoadEdge {
  from: string;
  to: string;
  roadName: string;
  /** walk 表示含台阶或人行步道（如广工人行天桥、南二路公园步道），骑行模式会自动避开 */
  mode: 'both' | 'walk';
  /** 道路等级，用于 3D 地图绘制不同宽度与材质 */
  kind: 'ring' | 'main' | 'campus' | 'path' | 'tunnel' | 'bridge';
  note?: string;
}

export interface CampusFeaturePolygon {
  id: string;
  name: string;
  kind: 'water' | 'park' | 'hill' | 'court' | 'village' | 'plaza';
  /** 顺时针/逆时针多边形顶点 [lat, lng][] */
  points: [number, number][];
  /** 若是小山丘，设置峰值高度（米） */
  elevation?: number;
}

/** 广工大学城校区投影中心（中环西路与挑战路隧道附近） */
export const GDUT_HEMC_ORIGIN = { lat: 23.0415, lng: 113.3885 } as const;

/** 校园严格地理边界（超出此边界则认为用户不在大学城校区内） */
export const GDUT_HEMC_BOUNDS = {
  minLat: 23.0342,
  maxLat: 23.0492,
  minLng: 113.3745,
  maxLng: 113.3985,
} as const;

/** 纬度 23.04° 处每度对应的米数 */
const METERS_PER_DEG_LAT = 111_195;
const METERS_PER_DEG_LNG = 111_195 * Math.cos((GDUT_HEMC_ORIGIN.lat * Math.PI) / 180);

export interface LocalPoint {
  x: number;
  z: number;
}

/** WGS-84 经纬度 → 本地 3D 米制坐标（+x 向东，+z 向南，-z 向北） */
export function latLngToLocal(lat: number, lng: number): LocalPoint {
  return {
    x: (lng - GDUT_HEMC_ORIGIN.lng) * METERS_PER_DEG_LNG,
    z: -(lat - GDUT_HEMC_ORIGIN.lat) * METERS_PER_DEG_LAT,
  };
}

/** 本地 3D 米制坐标 → WGS-84 经纬度 */
export function localToLatLng(x: number, z: number): { lat: number; lng: number } {
  return {
    lat: GDUT_HEMC_ORIGIN.lat - z / METERS_PER_DEG_LAT,
    lng: GDUT_HEMC_ORIGIN.lng + x / METERS_PER_DEG_LNG,
  };
}

/** 判断经纬度是否位于广工大学城校区及紧邻周边范围内 */
export function isInsideCampusBounds(lat: number, lng: number): boolean {
  return (
    lat >= GDUT_HEMC_BOUNDS.minLat &&
    lat <= GDUT_HEMC_BOUNDS.maxLat &&
    lng >= GDUT_HEMC_BOUNDS.minLng &&
    lng <= GDUT_HEMC_BOUNDS.maxLng
  );
}

/** 两点平面欧氏距离（米，校内尺度误差 < 0.1%） */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const pa = latLngToLocal(a.lat, a.lng);
  const pb = latLngToLocal(b.lat, b.lng);
  return Math.hypot(pa.x - pb.x, pa.z - pb.z);
}

/** 广工大学城校区全部核心建筑与地标（经纬度与 OpenStreetMap 实景路网一致，饭堂位置已与本校同学核对） */
export const GDUT_HEMC_BUILDINGS: CampusBuilding[] = [
  // ---------- 教学楼与大教室（中环西路以南 ~ 知行大道） ----------
  {
    id: 'jiao1',
    name: '教学一号楼',
    shortName: '教1',
    aliases: ['教一', '教1', '教学1号楼', '1号教学楼', '教1号楼'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0402,
    lng: 113.3935,
    width: 68,
    depth: 52,
    height: 22,
    shape: 'matrix',
    priority: 1,
    roadNodeId: 'n-mingde-zhixing',
    tip: '教学楼群最东侧（明德路东边），靠近实验四号楼与广工一路。',
    entrance: '知行大道北侧主入口 / 明德路连廊',
  },
  {
    id: 'jiao2',
    name: '教学二号楼',
    shortName: '教2',
    aliases: ['教二', '教2', '教学2号楼', '2号教学楼', '教2号楼'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0411,
    lng: 113.3929,
    width: 66,
    depth: 48,
    height: 22,
    shape: 'matrix',
    priority: 1,
    roadNodeId: 'n-mingde-beilu',
    tip: '位于教1北侧、明德路与环教北路交汇处，去东区从广工一路或挑战路都方便。',
    entrance: '环教北路南侧 / 明德路入口',
  },
  {
    id: 'jiao3',
    name: '教学三号楼',
    shortName: '教3',
    aliases: ['教三', '教3', '教学3号楼', '3号教学楼', '教3号楼'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0402,
    lng: 113.3905,
    width: 64,
    depth: 50,
    height: 22,
    shape: 'matrix',
    priority: 1,
    roadNodeId: 'n-chuangxin-zhixing',
    tip: '创新大道西侧、图书馆东北面，紧邻三号大教室，是公选课高发地。',
    entrance: '创新大道西侧 / 知行大道入口',
  },
  {
    id: 'jiao4',
    name: '教学四号楼',
    shortName: '教4',
    aliases: ['教四', '教4', '教学4号楼', '4号教学楼', '教4号楼'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0411,
    lng: 113.3905,
    width: 64,
    depth: 48,
    height: 22,
    shape: 'matrix',
    priority: 1,
    roadNodeId: 'n-chuangxin-beilu',
    tip: '在教3正北面，紧贴环教北路和创新科技楼，靠近中环西路广工公交站。',
    entrance: '环教北路入口 / 创新大道西侧',
  },
  {
    id: 'jiao5',
    name: '教学五号楼',
    shortName: '教5',
    aliases: ['教五', '教5', '教学5号楼', '5号教学楼', '教5号楼'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0402,
    lng: 113.3891,
    width: 64,
    depth: 50,
    height: 22,
    shape: 'matrix',
    priority: 1,
    roadNodeId: 'n-tiaozhan-zhixing',
    tip: '教学楼群西南角，就在工大创谷/图书馆正北面，紧邻挑战路。',
    entrance: '挑战路东侧 / 知行大道北侧',
  },
  {
    id: 'jiao6',
    name: '教学六号楼',
    shortName: '教6',
    aliases: ['教六', '教6', '教学6号楼', '6号教学楼', '教6号楼'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0411,
    lng: 113.3891,
    width: 64,
    depth: 48,
    height: 22,
    shape: 'matrix',
    priority: 1,
    roadNodeId: 'n-tiaozhan-beilu',
    tip: '教学楼群西北角，穿过挑战路下穿隧道一出来左手边就是教6！',
    entrance: '挑战路东侧 / 环教北路南侧',
  },
  {
    id: 'big1',
    name: '一号大教室',
    shortName: '一大',
    aliases: ['一号大教室', '1号大教室', '一大', '大教室1', '大1'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0406,
    lng: 113.3916,
    width: 34,
    depth: 24,
    height: 16,
    shape: 'tiered',
    priority: 1,
    roadNodeId: 'n-chuangxin-mid',
    tip: '夹在创新大道与求是路之间（教3/教4正东边），别走到教学一号楼去了！',
    entrance: '创新大道东侧连廊',
  },
  {
    id: 'big3',
    name: '三号大教室',
    shortName: '三大',
    aliases: ['三号大教室', '3号大教室', '三大', '大教室3', '大3'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0401,
    lng: 113.3916,
    width: 34,
    depth: 22,
    height: 16,
    shape: 'tiered',
    priority: 1,
    roadNodeId: 'n-chuangxin-zhixing',
    tip: '在一号大教室正南面、知行大道北侧（勤奋广场对面），大班高数/思政课常在这。',
    entrance: '知行大道北侧台阶 / 创新大道东侧',
  },
  {
    id: 'big4',
    name: '四号大教室',
    shortName: '四大',
    aliases: ['四号大教室', '4号大教室', '四大', '大教室4', '大4'],
    category: 'teaching',
    zone: 'teaching',
    lat: 23.0412,
    lng: 113.3916,
    width: 34,
    depth: 22,
    height: 16,
    shape: 'tiered',
    priority: 1,
    roadNodeId: 'n-chuangxin-beilu',
    tip: '在一号大教室正北面、紧邻环教北路，从教4往东过创新大道一步即到。',
    entrance: '环教北路南侧 / 创新大道东侧',
  },

  // ---------- 图书馆、综合楼与地标 ----------
  {
    id: 'library',
    name: '广东工业大学图书馆',
    shortName: '图书馆',
    aliases: ['图书馆', '广寒宫', '中心图书馆', 'lib'],
    category: 'landmark',
    zone: 'landmark',
    lat: 23.0389,
    lng: 113.3898,
    width: 82,
    depth: 74,
    height: 30,
    shape: 'courtyard',
    priority: 1,
    roadNodeId: 'n-lib-front',
    tip: '标志性回字形中空大楼，在知行大道南侧、团结湖北岸。空调超冷记得带外套。',
    entrance: '北侧主广场（知行大道）',
  },
  {
    id: 'chuanggu',
    name: '工大创谷',
    shortName: '创谷',
    aliases: ['工大创谷', '创谷', '创新创业学院'],
    category: 'landmark',
    zone: 'landmark',
    lat: 23.0396,
    lng: 113.3898,
    width: 52,
    depth: 22,
    height: 12,
    priority: 2,
    roadNodeId: 'n-lib-front',
    tip: '就在图书馆正北门与教5之间的知行大道旁，比赛项目和团队基地都在这。',
  },
  {
    id: 'zonghelou',
    name: '综合楼 / 行政楼',
    shortName: '综合楼',
    aliases: ['综合楼', '行政楼', '办公楼', '校办'],
    category: 'landmark',
    zone: 'landmark',
    lat: 23.0369,
    lng: 113.3909,
    width: 46,
    depth: 62,
    height: 26,
    priority: 1,
    roadNodeId: 'n-chuangxin-south',
    tip: '位于团结湖东岸、创新大道西侧，靠近工大广场，办行政盖章业务来这里。',
  },
  {
    id: 'dajiangtang',
    name: '大讲堂',
    shortName: '大讲堂',
    aliases: ['大讲堂', '学术报告厅', '圆弧报告厅', '礼堂'],
    category: 'landmark',
    zone: 'landmark',
    lat: 23.0365,
    lng: 113.3922,
    width: 54,
    depth: 42,
    height: 18,
    shape: 'semicircle',
    priority: 2,
    roadNodeId: 'n-qiushi-south',
    tip: '求是路东侧、工大广场东北面，大型讲座、迎新晚会和宣讲会主场地。',
  },
  {
    id: 'south-gate',
    name: '大学城校区正门（工大广场）',
    shortName: '正门',
    aliases: ['正门', '南门', '主校门', '工大广场', '大学城外环西路100号'],
    category: 'landmark',
    zone: 'gate',
    lat: 23.0358,
    lng: 113.3915,
    width: 72,
    depth: 20,
    height: 11,
    shape: 'gate',
    priority: 2,
    roadNodeId: 'n-south-gate',
    tip: '面向大学城外环西路的标志性柱廊主校门，拍照打卡地标。',
  },

  // ---------- 工学馆、实验楼、理学馆与科技楼（东南大片） ----------
  {
    id: 'gong1',
    name: '工学一号馆',
    shortName: '工学1馆',
    aliases: ['工学一号馆', '工学1号馆', '工一', '工1', '工学1', '信息工程学院', '计算机学院'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0369,
    lng: 113.3928,
    width: 108,
    depth: 26,
    height: 26,
    priority: 1,
    roadNodeId: 'n-mingde-yanxue1',
    tip: '求是路与明德路之间最南侧的工学馆（紧邻理学馆西侧），计算机/信息学院在此。',
    entrance: '研学一路南侧 / 明德路入口',
  },
  {
    id: 'gong2',
    name: '工学二号馆',
    shortName: '工学2馆',
    aliases: ['工学二号馆', '工学2号馆', '工二', '工2', '工学2', '机电工程学院'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0376,
    lng: 113.3928,
    width: 108,
    depth: 26,
    height: 26,
    priority: 1,
    roadNodeId: 'n-mingde-yanxue1',
    tip: '位于工学一号馆正北侧、研学一路北边，机电学院所在地。',
    entrance: '研学一路北侧 / 明德路入口',
  },
  {
    id: 'gong4',
    name: '工学四号馆',
    shortName: '工学4馆',
    aliases: ['工学四号馆', '工学4号馆', '工四', '工4', '工学4', '工学三号馆', '工三', '轻工化工学院'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0384,
    lng: 113.3928,
    width: 108,
    depth: 26,
    height: 26,
    priority: 1,
    roadNodeId: 'n-mingde-yanxue2',
    tip: '研学二路北侧、求是路与明德路之间（注意东南片区按北→南排布为工学4→工学2→工学1）。',
    entrance: '研学二路北侧 / 求是路入口',
  },
  {
    id: 'shi1',
    name: '实验一号楼',
    shortName: '实验1楼',
    aliases: ['实验一号楼', '实验1号楼', '实一', '实1', '实验1'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0373,
    lng: 113.3941,
    width: 96,
    depth: 22,
    height: 22,
    priority: 2,
    roadNodeId: 'n-mingde-yanxue1',
    tip: '明德路东侧、工学二号馆斜对面，与理学馆相邻。',
  },
  {
    id: 'shi2',
    name: '实验二号楼',
    shortName: '实验2楼',
    aliases: ['实验二号楼', '实验2号楼', '实二', '实2', '实验2'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0379,
    lng: 113.3941,
    width: 96,
    depth: 22,
    height: 22,
    priority: 2,
    roadNodeId: 'n-mingde-yanxue2',
    tip: '明德路东侧中段（研学二路南边），物电/计算机等基础实验常在这。',
  },
  {
    id: 'shi3',
    name: '实验三号楼',
    shortName: '实验3楼',
    aliases: ['实验三号楼', '实验3号楼', '实三', '实3', '实验3'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0385,
    lng: 113.3941,
    width: 96,
    depth: 22,
    height: 22,
    priority: 2,
    roadNodeId: 'n-mingde-yanxue2',
    tip: '明德路东侧、研学二路北边，正对工学四号馆。',
  },
  {
    id: 'shi4',
    name: '实验四号楼',
    shortName: '实验4楼',
    aliases: ['实验四号楼', '实验4号楼', '实四', '实4', '实验4'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0391,
    lng: 113.3941,
    width: 96,
    depth: 24,
    height: 22,
    priority: 1,
    roadNodeId: 'n-mingde-zhixing',
    tip: '实验楼群最北排，就在知行大道南侧、教学一号楼正对面。',
  },
  {
    id: 'lixueguan',
    name: '理学馆',
    shortName: '理学馆',
    aliases: ['理学馆', '物理楼', '数学学院'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0367,
    lng: 113.3941,
    width: 86,
    depth: 24,
    height: 24,
    priority: 2,
    roadNodeId: 'n-mingde-south',
    tip: '实验楼群最南排、工学一号馆正东侧，靠近外环西路。',
  },
  {
    id: 'chuangxin-tech',
    name: '创新科技楼 A/B座',
    shortName: '创新科技楼',
    aliases: ['创新科技楼', '创新科技楼A座', '创新科技楼B座'],
    category: 'lab',
    zone: 'teaching',
    lat: 23.0419,
    lng: 113.3910,
    width: 78,
    depth: 34,
    height: 26,
    priority: 2,
    roadNodeId: 'n-chuangxin-beilu',
    tip: '环教北路北侧、紧贴中环西路广工公交站南边。',
  },
  {
    id: 'qiushi-tech',
    name: '求实科技楼 A/B座',
    shortName: '求实科技楼',
    aliases: ['求实科技楼', '求是科技楼', '求实科技楼A座', '求实科技楼B座'],
    category: 'lab',
    zone: 'teaching',
    lat: 23.0419,
    lng: 113.3929,
    width: 74,
    depth: 34,
    height: 26,
    priority: 2,
    roadNodeId: 'n-mingde-beilu',
    tip: '教学区东北角，靠近广工一路 P843 路口。',
  },
  {
    id: 'lide-tech',
    name: '立德科技楼 A/B座',
    shortName: '立德科技楼',
    aliases: ['立德科技楼', '立德楼', '立德科技楼A座', '立德科技楼B座'],
    category: 'lab',
    zone: 'lab',
    lat: 23.0376,
    lng: 113.3951,
    width: 30,
    depth: 94,
    height: 28,
    priority: 2,
    roadNodeId: 'n-boya-mid',
    tip: '博雅路最东侧的高层科研楼，实验楼再往东走一条路。',
  },

  // ---------- 文体区与南亭入口（中环西路以南西侧） ----------
  {
    id: 'culture-center',
    name: '文化活动中心',
    shortName: '文化中心',
    aliases: ['文化活动中心', '学生活动中心', '大学生活动中心'],
    category: 'sports',
    zone: 'sports',
    lat: 23.0410,
    lng: 113.3873,
    width: 66,
    depth: 62,
    height: 18,
    priority: 2,
    roadNodeId: 'n-tiaozhan-beilu',
    tip: '挑战路西侧、教6对面，社团排练与晚会常用场地。',
  },
  {
    id: 'stadium',
    name: '中心体育场',
    shortName: '体育场',
    aliases: ['中心体育场', '田径场', '足球场', '操场', '大操场'],
    category: 'sports',
    zone: 'sports',
    lat: 23.0408,
    lng: 113.3859,
    width: 76,
    depth: 130,
    height: 6,
    shape: 'stadium',
    priority: 1,
    roadNodeId: 'n-tiyuguan-north',
    tip: '体测、夜跑和足球赛主场，就在体育馆东侧、文化活动中心西侧。',
  },
  {
    id: 'gym',
    name: '广工体育馆',
    shortName: '体育馆',
    aliases: ['体育馆', '篮球馆', '体育学院', 'CUBAL主场'],
    category: 'sports',
    zone: 'sports',
    lat: 23.0412,
    lng: 113.3845,
    width: 78,
    depth: 66,
    height: 22,
    shape: 'dome',
    priority: 1,
    roadNodeId: 'n-tiyuguan-north',
    tip: '广工人行天桥南口正对体育馆！西区同学步行来教学/体育区常从这里过天桥。',
    entrance: '环教北路（广工人行天桥南口）',
  },
  {
    id: 'nanting-gate',
    name: '南亭村口（商业美食街）',
    shortName: '南亭村',
    aliases: ['南亭', '南亭村', '南亭村口', '南亭大道', '南亭商业街', '夜宵街'],
    category: 'sports',
    zone: 'gate',
    lat: 23.0392,
    lng: 113.3826,
    width: 68,
    depth: 36,
    height: 12,
    priority: 1,
    roadNodeId: 'n-nanting-street',
    tip: '体育馆/篮球场往西南穿过环教西路即达南亭村大街，干饭宵夜主战场。',
  },

  // ---------- 生活东区（中环西路以北，广工二路~广工一路） ----------
  {
    id: 'canteen1',
    name: '第一饭堂（东区服务中心）',
    shortName: '一饭',
    aliases: ['一饭', '第一饭堂', '东区一饭', '一食堂', '东区服务中心'],
    category: 'canteen',
    zone: 'canteen',
    lat: 23.0464,
    lng: 113.3903,
    width: 58,
    depth: 42,
    height: 15,
    priority: 1,
    roadNodeId: 'n-east-canteen1',
    tip: '位于东区北侧、东八栋北边与东区服务中心相连，靠近校医院和广工一路。',
  },
  {
    id: 'canteen2',
    name: '第二饭堂',
    shortName: '二饭',
    aliases: ['二饭', '第二饭堂', '东区二饭', '二食堂'],
    category: 'canteen',
    zone: 'canteen',
    lat: 23.0439,
    lng: 113.3867,
    width: 64,
    depth: 56,
    height: 15,
    shape: 'semicircle',
    priority: 1,
    roadNodeId: 'n-east-canteen2',
    tip: '东12南侧、广工二路边的标志性半圆形大饭堂，离西区和挑战路隧道都很近。',
  },
  {
    id: 'hospital',
    name: '校医院',
    shortName: '校医院',
    aliases: ['校医院', '医院', '医务室', '门诊部'],
    category: 'canteen',
    zone: 'east',
    lat: 23.0472,
    lng: 113.3890,
    width: 52,
    depth: 34,
    height: 16,
    priority: 2,
    roadNodeId: 'n-east-north',
    tip: '东区最北侧（东苑四横路南边），紧邻一饭西北角。',
  },
  {
    id: 'dong1',
    name: '东区一栋',
    shortName: '东1',
    aliases: ['东一', '东1', '东区1栋', '东区一栋', '东1栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0439,
    lng: 113.3917,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-1-mid',
    tip: '东区东南角，靠近中环西路广工一路路口与大学城南地铁站方向。',
  },
  {
    id: 'dong2',
    name: '东区二栋',
    shortName: '东2',
    aliases: ['东二', '东2', '东区2栋', '东区二栋', '东2栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0445,
    lng: 113.3917,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-1-mid',
    tip: '东区东苑一路东侧，东一北边。',
  },
  {
    id: 'dong3',
    name: '东区三栋',
    shortName: '东3',
    aliases: ['东三', '东3', '东区3栋', '东区三栋', '东3栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0451,
    lng: 113.3917,
    width: 58,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-1-north',
    tip: '东区东北角，靠近广工一路与一饭。',
  },
  {
    id: 'dong4',
    name: '东区四栋',
    shortName: '东4',
    aliases: ['东四', '东4', '东区4栋', '东区四栋', '东4栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0434,
    lng: 113.3902,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-2-south',
    tip: '东区最靠中环西路广工站的一排宿舍，下楼过挑战路隧道即可到教6。',
  },
  {
    id: 'dong6',
    name: '东区六栋',
    shortName: '东6',
    aliases: ['东六', '东6', '东区6栋', '东区六栋', '东6栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0444,
    lng: 113.3902,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-2-mid',
    tip: '东苑二路东侧，东四北面、东七南面。',
  },
  {
    id: 'dong7',
    name: '东区七栋',
    shortName: '东7',
    aliases: ['东七', '东7', '东区7栋', '东区七栋', '东7栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0450,
    lng: 113.3902,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-2-mid',
    tip: '东区中段，去一饭和二饭距离都很均衡。',
  },
  {
    id: 'dong8',
    name: '东区八栋',
    shortName: '东8',
    aliases: ['东八', '东8', '东区8栋', '东区八栋', '东8栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0456,
    lng: 113.3902,
    width: 64,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-east-canteen1',
    tip: '紧邻一饭与东区服务中心南侧，干饭最方便。',
  },
  {
    id: 'dong9',
    name: '东区九栋',
    shortName: '东9',
    aliases: ['东九', '东9', '东区9栋', '东区九栋', '东9栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0434,
    lng: 113.3881,
    width: 64,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-tiaozhan-north',
    tip: '紧邻挑战路下穿隧道北口，去教学区最快的一排宿舍。',
  },
  {
    id: 'dong10',
    name: '东区十栋',
    shortName: '东10',
    aliases: ['东十', '东10', '东区10栋', '东区十栋', '东10栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0440,
    lng: 113.3881,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-tiaozhan-north',
    tip: '东九北侧、漠阳园南侧（注意广工东区没有东11栋哦）。',
  },
  {
    id: 'dong12',
    name: '东区十二栋',
    shortName: '东12',
    aliases: ['东十二', '东12', '东区12栋', '东区十二栋', '东12栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0448,
    lng: 113.3866,
    width: 66,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-east-3-mid',
    tip: '东区西侧靠近广工二路，楼下南边就是二饭！',
  },
  {
    id: 'dong13',
    name: '东区十三栋',
    shortName: '东13',
    aliases: ['东十三', '东13', '东区13栋', '东区十三栋', '东13栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0454,
    lng: 113.3866,
    width: 66,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-3-mid',
    tip: '东12北侧，紧靠广工二路与南二路公园。',
  },
  {
    id: 'dong14',
    name: '东区十四栋',
    shortName: '东14',
    aliases: ['东十四', '东14', '东区14栋', '东区十四栋', '东14栋'],
    category: 'dorm-east',
    zone: 'east',
    lat: 23.0460,
    lng: 113.3866,
    width: 66,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-east-3-north',
    tip: '东区西北排宿舍，紧邻教师公寓A与广工二路。',
  },

  // ---------- 生活西区（中环西路以北，国医西路~国医东路） ----------
  {
    id: 'canteen3',
    name: '第三饭堂',
    shortName: '三饭',
    aliases: ['三饭', '第三饭堂', '西区三饭', '三食堂'],
    category: 'canteen',
    zone: 'canteen',
    lat: 23.0439,
    lng: 113.3825,
    width: 52,
    depth: 48,
    height: 15,
    priority: 1,
    roadNodeId: 'n-west-canteen3',
    tip: '西5/西6东侧、国医东路边，步行过广工人行天桥去体育馆/教学区最顺路。',
  },
  {
    id: 'canteen4',
    name: '第四饭堂',
    shortName: '四饭',
    aliases: ['四饭', '第四饭堂', '西区四饭', '四食堂'],
    category: 'canteen',
    zone: 'canteen',
    lat: 23.0440,
    lng: 113.3775,
    width: 50,
    depth: 44,
    height: 15,
    priority: 1,
    roadNodeId: 'n-west-canteen4',
    tip: '西13/西17西侧、紧邻国医西路，口碑很好的西区饭堂。',
  },
  {
    id: 'xi2',
    name: '西二栋',
    shortName: '西2',
    aliases: ['西二', '西2', '西区2栋', '西区二栋', '西2栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0458,
    lng: 113.3825,
    width: 58,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-3-mid',
    tip: '西区东北列，靠近国医东路与南二路公园。',
  },
  {
    id: 'xi3',
    name: '西三栋',
    shortName: '西3',
    aliases: ['西三', '西3', '西区3栋', '西区三栋', '西3栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0466,
    lng: 113.3826,
    width: 58,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-3-north',
    tip: '西二北侧，靠近国医东路。',
  },
  {
    id: 'xi4',
    name: '西四栋',
    shortName: '西4',
    aliases: ['西四', '西4', '西区4栋', '西区四栋', '西4栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0472,
    lng: 113.3827,
    width: 58,
    depth: 20,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-3-north',
    tip: '西区最东北角，靠近康陵路与国医东路。',
  },
  {
    id: 'xi5',
    name: '西五栋',
    shortName: '西5',
    aliases: ['西五', '西5', '西区5栋', '西区五栋', '西5栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0434,
    lng: 113.3811,
    width: 64,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-west-2-south',
    tip: '西区最靠南的宿舍之一，出门往东即到三饭和广工人行天桥方向。',
  },
  {
    id: 'xi6',
    name: '西六栋',
    shortName: '西6',
    aliases: ['西六', '西6', '西区6栋', '西区六栋', '西6栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0442,
    lng: 113.3811,
    width: 64,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-west-2-south',
    tip: '西五北侧、三饭正西边，楼下就是西苑横路。',
  },
  {
    id: 'xi7',
    name: '西七栋',
    shortName: '西7',
    aliases: ['西七', '西7', '西区7栋', '西区七栋', '西7栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0449,
    lng: 113.3811,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-2-mid',
    tip: '西苑横路北侧、西苑二路与西苑三路之间。',
  },
  {
    id: 'xi8',
    name: '西八栋',
    shortName: '西8',
    aliases: ['西八', '西8', '西区8栋', '西区八栋', '西8栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0457,
    lng: 113.3811,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-2-mid',
    tip: '西区中轴东列，西七北侧。',
  },
  {
    id: 'xi9',
    name: '西九栋',
    shortName: '西9',
    aliases: ['西九', '西9', '西区9栋', '西区九栋', '西9栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0465,
    lng: 113.3811,
    width: 64,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-2-north',
    tip: '西区中北排，北边是康陵路。',
  },
  {
    id: 'xi10',
    name: '西十栋',
    shortName: '西10',
    aliases: ['西十', '西10', '西区10栋', '西区十栋', '西10栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0449,
    lng: 113.3792,
    width: 58,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-1-mid',
    tip: '西苑横路北侧偏西，面对西区小广场。',
  },
  {
    id: 'xi11',
    name: '西十一栋',
    shortName: '西11',
    aliases: ['西十一', '西11', '西区11栋', '西区十一栋', '西11栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0457,
    lng: 113.3792,
    width: 58,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-1-mid',
    tip: '西十北侧、西苑一路东侧。',
  },
  {
    id: 'xi12',
    name: '西十二栋',
    shortName: '西12',
    aliases: ['西十二', '西12', '西区12栋', '西区十二栋', '西12栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0465,
    lng: 113.3792,
    width: 58,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-1-north',
    tip: '西十一北侧，靠近康陵路。',
  },
  {
    id: 'xi13',
    name: '西十三栋',
    shortName: '西13',
    aliases: ['西十三', '西13', '西区13栋', '西区十三栋', '西13栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0450,
    lng: 113.3775,
    width: 56,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-west-canteen4',
    tip: '西区最西列，紧邻四饭北侧与国医西路！',
  },
  {
    id: 'xi14',
    name: '西十四栋',
    shortName: '西14',
    aliases: ['西十四', '西14', '西区14栋', '西区十四栋', '西14栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0458,
    lng: 113.3776,
    width: 56,
    depth: 22,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-1-mid',
    tip: '西十三北侧，靠国医西路。',
  },
  {
    id: 'xi15',
    name: '西十五栋',
    shortName: '西15',
    aliases: ['西十五', '西15', '西区15栋', '西区十五栋', '西15栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0466,
    lng: 113.3779,
    width: 54,
    depth: 20,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-1-north',
    tip: '西区西北角，西十四北侧。',
  },
  {
    id: 'xi16',
    name: '西十六栋',
    shortName: '西16',
    aliases: ['西十六', '西16', '西区16栋', '西区十六栋', '西16栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0472,
    lng: 113.3782,
    width: 52,
    depth: 20,
    height: 20,
    priority: 3,
    roadNodeId: 'n-west-1-north',
    tip: '西区最西北角，靠国医西路与康陵路交叉口。',
  },
  {
    id: 'xi17',
    name: '西十七栋',
    shortName: '西17',
    aliases: ['西十七', '西17', '西区17栋', '西区十七栋', '西17栋'],
    category: 'dorm-west',
    zone: 'west',
    lat: 23.0439,
    lng: 113.3791,
    width: 62,
    depth: 22,
    height: 20,
    priority: 2,
    roadNodeId: 'n-west-canteen4',
    tip: '金银山北侧、四饭东侧，靠近西苑横路。',
  },
  {
    id: 'metro-south',
    name: '大学城南地铁站方向',
    shortName: '大学城南站',
    aliases: ['地铁站', '大学城南', '大学城南站', '地铁4号线', '地铁7号线'],
    category: 'landmark',
    zone: 'gate',
    lat: 23.0442,
    lng: 113.3952,
    width: 44,
    depth: 26,
    height: 10,
    priority: 2,
    roadNodeId: 'n-ring-p843',
    tip: '从东区广工一路口（P843）往东北步行约 5 分钟即达 4/7 号线换乘站。',
  },
];

/** 校园地形与景观多边形（水系、小山丘、公园、篮球场、南亭街区） */
export const GDUT_HEMC_FEATURES: CampusFeaturePolygon[] = [
  {
    id: 'tuanjie-lake',
    name: '团结湖',
    kind: 'water',
    points: [
      [23.0391, 113.3886],
      [23.0385, 113.3892],
      [23.0378, 113.3905],
      [23.0366, 113.3906],
      [23.0361, 113.3895],
      [23.0365, 113.3882],
      [23.0376, 113.3884],
      [23.0384, 113.3880],
    ],
  },
  {
    id: 'naner-river',
    name: '南亭西街涌',
    kind: 'water',
    points: [
      [23.0468, 113.3840],
      [23.0466, 113.3849],
      [23.0446, 113.3842],
      [23.0432, 113.3836],
      [23.0424, 113.3812],
      [23.0414, 113.3792],
      [23.0419, 113.3788],
      [23.0430, 113.3811],
      [23.0438, 113.3832],
      [23.0450, 113.3835],
    ],
  },
  {
    id: 'naner-park',
    name: '大学城南二路公园',
    kind: 'park',
    points: [
      [23.0469, 113.3835],
      [23.0469, 113.3858],
      [23.0427, 113.3858],
      [23.0427, 113.3834],
    ],
  },
  {
    id: 'jinyin-hill',
    name: '金银山 (32m)',
    kind: 'hill',
    elevation: 18,
    points: [
      [23.0435, 113.3776],
      [23.0434, 113.3796],
      [23.0423, 113.3798],
      [23.0421, 113.3777],
    ],
  },
  {
    id: 'moyang-hill',
    name: '漠阳园 (29m)',
    kind: 'hill',
    elevation: 14,
    points: [
      [23.0459, 113.3875],
      [23.0459, 113.3892],
      [23.0445, 113.3892],
      [23.0445, 113.3875],
    ],
  },
  {
    id: 'courts-bc',
    name: 'B/C区篮球场',
    kind: 'court',
    points: [
      [23.0400, 113.3838],
      [23.0400, 113.3856],
      [23.0394, 113.3856],
      [23.0394, 113.3838],
    ],
  },
  {
    id: 'courts-a',
    name: 'A区篮球场',
    kind: 'court',
    points: [
      [23.0392, 113.3867],
      [23.0392, 113.3879],
      [23.0380, 113.3879],
      [23.0380, 113.3867],
    ],
  },
  {
    id: 'qinfen-plaza',
    name: '勤奋广场',
    kind: 'plaza',
    points: [
      [23.0394, 113.3909],
      [23.0394, 113.3917],
      [23.0384, 113.3917],
      [23.0384, 113.3909],
    ],
  },
  {
    id: 'nanting-area',
    name: '南亭村生活圈',
    kind: 'village',
    points: [
      [23.0394, 113.3792],
      [23.0391, 113.3842],
      [23.0372, 113.3840],
      [23.0375, 113.3792],
    ],
  },
];

/** 广工大学城真实校内路网节点 */
export const GDUT_HEMC_ROAD_NODES: CampusRoadNode[] = [
  // 中环西路东西干道
  { id: 'n-ring-p835', lat: 23.0407, lng: 113.3782, label: '广美路/中环西路口(P835)' },
  { id: 'n-ring-p834', lat: 23.0422, lng: 113.3831, label: '国医东路/中环西路口(P834)' },
  { id: 'n-bridge-north', lat: 23.0427, lng: 113.3848, label: '广工人行天桥北口' },
  { id: 'n-bridge-south', lat: 23.0420, lng: 113.3848, label: '广工人行天桥南口' },
  { id: 'n-ring-p837', lat: 23.0424, lng: 113.3861, label: '广工二路/中环西路口(P837)' },
  { id: 'n-ring-mid', lat: 23.0422, lng: 113.3886, label: '中环西路(挑战路隧道上方)' },
  { id: 'n-ring-bus', lat: 23.0424, lng: 113.3905, label: '中环西路广工站' },
  { id: 'n-ring-p843', lat: 23.0429, lng: 113.3932, label: '广工一路/中环西路口(P843)' },

  // 生活西区路网
  { id: 'n-west-canteen4', lat: 23.0445, lng: 113.3775, label: '四饭/西13路口' },
  { id: 'n-west-1-mid', lat: 23.0453, lng: 113.3785, label: '西苑一路中段' },
  { id: 'n-west-1-north', lat: 23.0468, lng: 113.3785, label: '西12/西15北口' },
  { id: 'n-west-2-south', lat: 23.0439, lng: 113.3804, label: '西苑二路南口(西5/西6)' },
  { id: 'n-west-2-mid', lat: 23.0452, lng: 113.3804, label: '西苑横路中心' },
  { id: 'n-west-2-north', lat: 23.0468, lng: 113.3808, label: '康陵路(西9北口)' },
  { id: 'n-west-canteen3', lat: 23.0439, lng: 113.3822, label: '三饭/西苑三路南口' },
  { id: 'n-west-3-mid', lat: 23.0454, lng: 113.3829, label: '国医东路(西2旁)' },
  { id: 'n-west-3-north', lat: 23.0470, lng: 113.3832, label: '国医东路北口(西4旁)' },

  // 南二路公园步道（连接西区与东区，仅步行）
  { id: 'n-park-west', lat: 23.0445, lng: 113.3832, label: '国医东路公园入口' },
  { id: 'n-park-east', lat: 23.0445, lng: 113.3859, label: '广工二路公园入口' },

  // 生活东区路网
  { id: 'n-east-canteen2', lat: 23.0436, lng: 113.3860, label: '二饭/广工二路南口' },
  { id: 'n-east-3-mid', lat: 23.0451, lng: 113.3860, label: '广工二路(东12/东13)' },
  { id: 'n-east-3-north', lat: 23.0466, lng: 113.3864, label: '东苑三路北口(东14)' },
  { id: 'n-tiaozhan-north', lat: 23.0432, lng: 113.3886, label: '挑战路隧道北口(东9/东10)' },
  { id: 'n-east-2-south', lat: 23.0435, lng: 113.3896, label: '东苑二路南口(东4)' },
  { id: 'n-east-2-mid', lat: 23.0447, lng: 113.3896, label: '东苑二路中段(东6/东7)' },
  { id: 'n-east-canteen1', lat: 23.0461, lng: 113.3896, label: '一饭/东区服务中心' },
  { id: 'n-east-north', lat: 23.0472, lng: 113.3892, label: '校医院/东苑四横路' },
  { id: 'n-east-1-mid', lat: 23.0443, lng: 113.3910, label: '东苑一路中段(东1/东2)' },
  { id: 'n-east-1-north', lat: 23.0455, lng: 113.3914, label: '广工一路北(东3/一饭东)' },

  // 体育区与南亭
  { id: 'n-tiyuguan-north', lat: 23.0418, lng: 113.3854, label: '环教北路(体育馆/体育场北)' },
  { id: 'n-huanjiao-west', lat: 23.0402, lng: 113.3834, label: '环教西路(体育馆西侧)' },
  { id: 'n-nanting-street', lat: 23.0394, lng: 113.3833, label: '南亭村大街口' },
  { id: 'n-nanting-east', lat: 23.0392, lng: 113.3864, label: 'B区篮球场南/环教西路' },

  // 教学区主路网
  { id: 'n-tiaozhan-beilu', lat: 23.0416, lng: 113.3886, label: '挑战路/环教北路口(教6/文化中心)' },
  { id: 'n-chuangxin-beilu', lat: 23.0416, lng: 113.3911, label: '创新大道/环教北路口(教4/四大)' },
  { id: 'n-mingde-beilu', lat: 23.0416, lng: 113.3932, label: '明德路/环教北路口(教2/求实楼)' },
  { id: 'n-chuangxin-mid', lat: 23.0406, lng: 113.3911, label: '创新大道中段(一大/教3/教4)' },
  { id: 'n-tiaozhan-zhixing', lat: 23.0397, lng: 113.3886, label: '挑战路/知行大道口(教5/图书馆西北)' },
  { id: 'n-lib-front', lat: 23.0397, lng: 113.3898, label: '知行大道(图书馆/工大创谷北门)' },
  { id: 'n-chuangxin-zhixing', lat: 23.0397, lng: 113.3911, label: '创新大道/知行大道口(教3/三大/勤奋广场)' },
  { id: 'n-qiushi-zhixing', lat: 23.0397, lng: 113.3920, label: '求是路/知行大道口' },
  { id: 'n-mingde-zhixing', lat: 23.0397, lng: 113.3935, label: '明德路/知行大道口(教1/实验4楼)' },
  { id: 'n-boya-zhixing', lat: 23.0397, lng: 113.3948, label: '博雅路/知行大道口' },

  // 图书馆南侧、工学馆、实验楼与外环西路
  { id: 'n-outer-west', lat: 23.0352, lng: 113.3872, label: '大学城外环西路(西段)' },
  { id: 'n-chuangxin-south', lat: 23.0370, lng: 113.3911, label: '创新大道南段(综合楼)' },
  { id: 'n-south-gate', lat: 23.0355, lng: 113.3914, label: '工大广场(南正门/外环西路)' },
  { id: 'n-qiushi-mid', lat: 23.0381, lng: 113.3920, label: '求是路中段(工学4/2馆西)' },
  { id: 'n-qiushi-south', lat: 23.0366, lng: 113.3920, label: '求是路南段(大讲堂/工学1馆西)' },
  { id: 'n-mingde-yanxue2', lat: 23.0382, lng: 113.3935, label: '明德路/研学二路口(工学4/实验2-3楼)' },
  { id: 'n-mingde-yanxue1', lat: 23.0372, lng: 113.3935, label: '明德路/研学一路口(工学1-2/实验1楼)' },
  { id: 'n-mingde-south', lat: 23.0364, lng: 113.3935, label: '明德路南口(理学馆)' },
  { id: 'n-boya-mid', lat: 23.0377, lng: 113.3948, label: '博雅路(立德科技楼)' },
  { id: 'n-boya-south', lat: 23.0367, lng: 113.3948, label: '博雅路南口(环教东路)' },
];

/** 广工大学城校内连通边（双向无向图，明确标注步行专用台阶/步道） */
export const GDUT_HEMC_ROAD_EDGES: CampusRoadEdge[] = [
  // 中环西路东西贯通
  { from: 'n-ring-p835', to: 'n-ring-p834', roadName: '大学城中环西路', mode: 'both', kind: 'ring' },
  { from: 'n-ring-p834', to: 'n-ring-p837', roadName: '大学城中环西路', mode: 'both', kind: 'ring' },
  { from: 'n-ring-p837', to: 'n-ring-mid', roadName: '大学城中环西路', mode: 'both', kind: 'ring' },
  { from: 'n-ring-mid', to: 'n-ring-bus', roadName: '大学城中环西路', mode: 'both', kind: 'ring' },
  { from: 'n-ring-bus', to: 'n-ring-p843', roadName: '大学城中环西路', mode: 'both', kind: 'ring' },

  // 关键南北跨中环西路通道
  {
    from: 'n-tiaozhan-north',
    to: 'n-tiaozhan-beilu',
    roadName: '挑战路下穿隧道',
    mode: 'both',
    kind: 'tunnel',
    note: '下穿中环西路隧道，免等红绿灯，步行和骑车都最顺畅',
  },
  {
    from: 'n-bridge-north',
    to: 'n-bridge-south',
    roadName: '广工人行天桥',
    mode: 'walk',
    kind: 'bridge',
    note: '跨越中环西路人行天桥（有台阶，仅限步行）',
  },
  { from: 'n-ring-p834', to: 'n-bridge-north', roadName: '中环西路北侧步道', mode: 'walk', kind: 'path' },
  { from: 'n-bridge-south', to: 'n-tiyuguan-north', roadName: '环教北路', mode: 'walk', kind: 'path' },
  { from: 'n-ring-p834', to: 'n-huanjiao-west', roadName: '环教西路(经P834路口)', mode: 'both', kind: 'main' },
  { from: 'n-huanjiao-west', to: 'n-tiyuguan-north', roadName: '环教西路北段', mode: 'both', kind: 'campus' },
  { from: 'n-ring-p837', to: 'n-tiyuguan-north', roadName: '广工二路/环教北路', mode: 'both', kind: 'main' },
  { from: 'n-ring-p837', to: 'n-east-canteen2', roadName: '大学城广工二路', mode: 'both', kind: 'main' },
  { from: 'n-ring-p843', to: 'n-mingde-beilu', roadName: '大学城广工一路', mode: 'both', kind: 'main' },
  { from: 'n-ring-p843', to: 'n-east-1-mid', roadName: '大学城广工一路', mode: 'both', kind: 'main' },
  { from: 'n-ring-bus', to: 'n-chuangxin-beilu', roadName: '广工站人行出口', mode: 'both', kind: 'campus' },

  // 生活西区路网
  { from: 'n-ring-p835', to: 'n-west-canteen4', roadName: '国医西路', mode: 'both', kind: 'main' },
  { from: 'n-west-canteen4', to: 'n-west-1-mid', roadName: '西苑一路', mode: 'both', kind: 'campus' },
  { from: 'n-west-1-mid', to: 'n-west-1-north', roadName: '西苑一路', mode: 'both', kind: 'campus' },
  { from: 'n-west-canteen4', to: 'n-west-2-south', roadName: '西苑横路', mode: 'both', kind: 'campus' },
  { from: 'n-west-1-mid', to: 'n-west-2-mid', roadName: '西苑横路', mode: 'both', kind: 'campus' },
  { from: 'n-west-1-north', to: 'n-west-2-north', roadName: '康陵路', mode: 'both', kind: 'main' },
  { from: 'n-west-2-south', to: 'n-west-2-mid', roadName: '西苑二路', mode: 'both', kind: 'campus' },
  { from: 'n-west-2-mid', to: 'n-west-2-north', roadName: '西苑二路', mode: 'both', kind: 'campus' },
  { from: 'n-west-2-south', to: 'n-west-canteen3', roadName: '西苑横路(三饭前)', mode: 'both', kind: 'campus' },
  { from: 'n-west-2-mid', to: 'n-west-3-mid', roadName: '西苑横路东段', mode: 'both', kind: 'campus' },
  { from: 'n-west-2-north', to: 'n-west-3-north', roadName: '康陵路', mode: 'both', kind: 'main' },
  { from: 'n-west-canteen3', to: 'n-ring-p834', roadName: '国医东路', mode: 'both', kind: 'main' },
  { from: 'n-west-canteen3', to: 'n-park-west', roadName: '国医东路', mode: 'both', kind: 'main' },
  { from: 'n-park-west', to: 'n-west-3-mid', roadName: '国医东路', mode: 'both', kind: 'main' },
  { from: 'n-west-3-mid', to: 'n-west-3-north', roadName: '国医东路', mode: 'both', kind: 'main' },

  // 南二路公园捷径（连接西区与东区，仅步行）
  {
    from: 'n-park-west',
    to: 'n-park-east',
    roadName: '南二路公园人行桥',
    mode: 'walk',
    kind: 'path',
    note: '穿过南二路公园与小桥直通东/西区（仅步行）',
  },

  // 生活东区路网
  { from: 'n-east-canteen2', to: 'n-park-east', roadName: '大学城广工二路', mode: 'both', kind: 'main' },
  { from: 'n-park-east', to: 'n-east-3-mid', roadName: '大学城广工二路', mode: 'both', kind: 'main' },
  { from: 'n-east-3-mid', to: 'n-east-3-north', roadName: '大学城广工二路', mode: 'both', kind: 'main' },
  { from: 'n-east-canteen2', to: 'n-tiaozhan-north', roadName: '东苑一横路西段', mode: 'both', kind: 'campus' },
  { from: 'n-tiaozhan-north', to: 'n-east-2-south', roadName: '东苑一横路', mode: 'both', kind: 'campus' },
  { from: 'n-east-2-south', to: 'n-east-1-mid', roadName: '东苑一横路东段', mode: 'both', kind: 'campus' },
  { from: 'n-east-2-south', to: 'n-east-2-mid', roadName: '东苑二路', mode: 'both', kind: 'campus' },
  { from: 'n-east-2-mid', to: 'n-east-canteen1', roadName: '东苑二路', mode: 'both', kind: 'campus' },
  { from: 'n-east-canteen1', to: 'n-east-north', roadName: '东苑二路北段', mode: 'both', kind: 'campus' },
  { from: 'n-east-3-mid', to: 'n-east-2-mid', roadName: '东苑二横路', mode: 'both', kind: 'campus' },
  { from: 'n-east-3-north', to: 'n-east-canteen1', roadName: '东苑三横路', mode: 'both', kind: 'campus' },
  { from: 'n-east-3-north', to: 'n-east-north', roadName: '东苑四横路', mode: 'both', kind: 'campus' },
  { from: 'n-east-2-mid', to: 'n-east-1-mid', roadName: '东苑一横路', mode: 'both', kind: 'campus' },
  { from: 'n-east-1-mid', to: 'n-east-1-north', roadName: '东苑一路', mode: 'both', kind: 'campus' },
  { from: 'n-east-canteen1', to: 'n-east-1-north', roadName: '东苑三横路东段', mode: 'both', kind: 'campus' },
  { from: 'n-east-north', to: 'n-east-1-north', roadName: '大学城广工一路', mode: 'both', kind: 'main' },

  // 体育区与南亭路网
  { from: 'n-tiyuguan-north', to: 'n-tiaozhan-beilu', roadName: '环教北路西段', mode: 'both', kind: 'main' },
  { from: 'n-huanjiao-west', to: 'n-nanting-street', roadName: '环教西路', mode: 'both', kind: 'campus' },
  { from: 'n-nanting-street', to: 'n-nanting-east', roadName: '南亭村大街', mode: 'both', kind: 'main' },
  { from: 'n-nanting-east', to: 'n-tiaozhan-zhixing', roadName: '知行大道西段', mode: 'both', kind: 'campus' },
  { from: 'n-nanting-east', to: 'n-tiyuguan-north', roadName: '体育场东侧通道', mode: 'both', kind: 'campus' },

  // 教学区网格
  { from: 'n-tiaozhan-beilu', to: 'n-chuangxin-beilu', roadName: '环教北路', mode: 'both', kind: 'main' },
  { from: 'n-chuangxin-beilu', to: 'n-mingde-beilu', roadName: '环教北路', mode: 'both', kind: 'main' },
  { from: 'n-tiaozhan-beilu', to: 'n-tiaozhan-zhixing', roadName: '挑战路', mode: 'both', kind: 'main' },
  { from: 'n-chuangxin-beilu', to: 'n-chuangxin-mid', roadName: '创新大道', mode: 'both', kind: 'main' },
  { from: 'n-chuangxin-mid', to: 'n-chuangxin-zhixing', roadName: '创新大道', mode: 'both', kind: 'main' },
  { from: 'n-mingde-beilu', to: 'n-mingde-zhixing', roadName: '明德路', mode: 'both', kind: 'main' },
  { from: 'n-mingde-beilu', to: 'n-boya-zhixing', roadName: '环教北路东段', mode: 'both', kind: 'campus' },
  { from: 'n-tiaozhan-zhixing', to: 'n-lib-front', roadName: '知行大道', mode: 'both', kind: 'main' },
  { from: 'n-lib-front', to: 'n-chuangxin-zhixing', roadName: '知行大道', mode: 'both', kind: 'main' },
  { from: 'n-chuangxin-zhixing', to: 'n-qiushi-zhixing', roadName: '知行大道', mode: 'both', kind: 'main' },
  { from: 'n-qiushi-zhixing', to: 'n-mingde-zhixing', roadName: '知行大道', mode: 'both', kind: 'main' },
  { from: 'n-mingde-zhixing', to: 'n-boya-zhixing', roadName: '知行大道东段', mode: 'both', kind: 'main' },

  // 教学区南部（图书馆、综合楼、工学馆、实验楼、外环西路）
  { from: 'n-chuangxin-zhixing', to: 'n-chuangxin-south', roadName: '创新大道', mode: 'both', kind: 'main' },
  { from: 'n-chuangxin-south', to: 'n-south-gate', roadName: '创新大道南段', mode: 'both', kind: 'main' },
  { from: 'n-south-gate', to: 'n-qiushi-south', roadName: '环教东路', mode: 'both', kind: 'campus' },
  { from: 'n-outer-west', to: 'n-south-gate', roadName: '大学城外环西路', mode: 'both', kind: 'ring' },
  { from: 'n-south-gate', to: 'n-mingde-south', roadName: '大学城外环西路', mode: 'both', kind: 'ring' },
  { from: 'n-qiushi-zhixing', to: 'n-qiushi-mid', roadName: '求是路', mode: 'both', kind: 'campus' },
  { from: 'n-qiushi-mid', to: 'n-qiushi-south', roadName: '求是路', mode: 'both', kind: 'campus' },
  { from: 'n-mingde-zhixing', to: 'n-mingde-yanxue2', roadName: '明德路', mode: 'both', kind: 'main' },
  { from: 'n-mingde-yanxue2', to: 'n-mingde-yanxue1', roadName: '明德路', mode: 'both', kind: 'main' },
  { from: 'n-mingde-yanxue1', to: 'n-mingde-south', roadName: '明德路', mode: 'both', kind: 'main' },
  { from: 'n-qiushi-mid', to: 'n-mingde-yanxue2', roadName: '研学二路', mode: 'both', kind: 'campus' },
  { from: 'n-qiushi-south', to: 'n-mingde-yanxue1', roadName: '研学一路', mode: 'both', kind: 'campus' },
  { from: 'n-boya-zhixing', to: 'n-boya-mid', roadName: '博雅路', mode: 'both', kind: 'campus' },
  { from: 'n-boya-mid', to: 'n-boya-south', roadName: '博雅路', mode: 'both', kind: 'campus' },
  { from: 'n-mingde-yanxue2', to: 'n-boya-mid', roadName: '研学二路东段', mode: 'both', kind: 'campus' },
  { from: 'n-mingde-yanxue1', to: 'n-boya-mid', roadName: '研学一路东段', mode: 'both', kind: 'campus' },
  { from: 'n-mingde-south', to: 'n-boya-south', roadName: '大学城外环西路', mode: 'both', kind: 'ring' },
];

const BUILDING_BY_ID = new Map(GDUT_HEMC_BUILDINGS.map((b) => [b.id, b]));
const NODE_BY_ID = new Map(GDUT_HEMC_ROAD_NODES.map((n) => [n.id, n]));

export function getCampusBuilding(id: string): CampusBuilding | undefined {
  return BUILDING_BY_ID.get(id);
}

/** 中文数字到阿拉伯数字简单归一化，支持搜「教三 / 教3 / 西十二 / 西12 / 实验二」 */
function normalizeCampusQuery(raw: string): string {
  const map: Record<string, string> = {
    一: '1',
    二: '2',
    三: '3',
    四: '4',
    五: '5',
    六: '6',
    七: '7',
    八: '8',
    九: '9',
  };
  let s = raw
    .trim()
    .toLowerCase()
    .replace(/[\s\-_·（）()【】[\]]+/g, '');
  // 处理「十几」和「十」
  s = s.replace(/十([一二三四五六七八九])/g, (_, d: string) => `1${map[d] ?? d}`);
  s = s.replace(/十/g, '10');
  s = s.replace(/[一二三四五六七八九]/g, (c) => map[c] ?? c);
  return s;
}

/**
 * 根据搜索词或课表教室名（如 `教3-305`、`实验2-401`、`三号大教室`、`工学1号馆203`）匹配校内楼栋。
 * 返回按相关度排序的匹配列表。
 */
export function searchCampusBuildings(query: string): CampusBuilding[] {
  const q = normalizeCampusQuery(query);
  if (!q) return GDUT_HEMC_BUILDINGS;

  const scored: { b: CampusBuilding; score: number }[] = [];
  for (const b of GDUT_HEMC_BUILDINGS) {
    const candidates = [b.name, b.shortName, ...b.aliases].map(normalizeCampusQuery);
    let best = 0;
    for (const c of candidates) {
      if (c === q) best = Math.max(best, 100);
      else if (c.startsWith(q)) best = Math.max(best, 85);
      else if (q.startsWith(c) && c.length >= 2) best = Math.max(best, 80 + Math.min(c.length, 10));
      else if (c.includes(q)) best = Math.max(best, 60);
      else if (q.includes(c) && c.length >= 2) best = Math.max(best, 50 + Math.min(c.length, 10));
    }
    if (best > 0) scored.push({ b, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.b.priority - b.b.priority)
    .map((x) => x.b);
}

/** 从课表教室字符串（如 `教3-305`、`工学一号馆203`、`三号大教室`）精准解析出最匹配的一栋楼 */
export function matchCampusBuilding(classroomOrName: string): CampusBuilding | null {
  if (!classroomOrName.trim()) return null;
  const list = searchCampusBuildings(classroomOrName);
  return list[0] ?? null;
}

/** 查找离任意经纬度最近的校内路网节点 */
export function findNearestRoadNode(lat: number, lng: number, mode: RouteMode = 'walk'): CampusRoadNode {
  const usable = new Set<string>();
  for (const e of GDUT_HEMC_ROAD_EDGES) {
    if (mode === 'bike' && e.mode === 'walk') continue;
    usable.add(e.from);
    usable.add(e.to);
  }
  let best = GDUT_HEMC_ROAD_NODES[0]!;
  let bestDist = Infinity;
  for (const node of GDUT_HEMC_ROAD_NODES) {
    if (!usable.has(node.id)) continue;
    const d = distanceMeters({ lat, lng }, node);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return best;
}

export interface RouteStep {
  roadName: string;
  direction: string;
  distanceMeters: number;
  note?: string;
}

export interface CampusRoutePlan {
  mode: RouteMode;
  distanceMeters: number;
  durationMinutes: number;
  /** 按顺序排列的路径经纬度坐标（含起终点） */
  waypoints: { lat: number; lng: number }[];
  steps: RouteStep[];
  /** 是否经过了隧道或天桥等关键跨中环节点 */
  crossings: string[];
}

export type RouteEndpoint =
  | { kind: 'building'; buildingId: string }
  | { kind: 'coord'; lat: number; lng: number; label?: string };

function cardinalDirection(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const a = latLngToLocal(from.lat, from.lng);
  const b = latLngToLocal(to.lat, to.lng);
  const dx = b.x - a.x;
  const dz = b.z - a.z; // +z 是南，-z 是北
  const deg = (Math.atan2(dx, -dz) * 180) / Math.PI; // 0=北, 90=东, 180=南, -90=西
  const norm = (deg + 360) % 360;
  if (norm < 22.5 || norm >= 337.5) return '向北';
  if (norm < 67.5) return '向东北';
  if (norm < 112.5) return '向东';
  if (norm < 157.5) return '向东南';
  if (norm < 202.5) return '向南';
  if (norm < 247.5) return '向西南';
  if (norm < 292.5) return '向西';
  return '向西北';
}

/** 步行约 75 米/分钟（4.5 km/h），校内骑行约 210 米/分钟（12.6 km/h） */
const SPEED_M_PER_MIN: Record<RouteMode, number> = {
  walk: 75,
  bike: 210,
};

/** 使用 A* 算法在广工大学城真实校内路网上计算最短路径（支持步行/骑行差异化路由） */
export function planCampusRoute(
  start: RouteEndpoint,
  end: RouteEndpoint,
  mode: RouteMode = 'walk',
): CampusRoutePlan | null {
  const resolveEndpoint = (ep: RouteEndpoint) => {
    if (ep.kind === 'building') {
      const b = BUILDING_BY_ID.get(ep.buildingId);
      if (!b) return null;
      const node = NODE_BY_ID.get(b.roadNodeId) ?? findNearestRoadNode(b.lat, b.lng, mode);
      return { lat: b.lat, lng: b.lng, nodeId: node.id };
    }
    const node = findNearestRoadNode(ep.lat, ep.lng, mode);
    return { lat: ep.lat, lng: ep.lng, nodeId: node.id };
  };

  const s = resolveEndpoint(start);
  const e = resolveEndpoint(end);
  if (!s || !e) return null;

  // 构建邻接表
  const adj = new Map<string, { to: string; weight: number; edge: CampusRoadEdge }[]>();
  for (const edge of GDUT_HEMC_ROAD_EDGES) {
    if (mode === 'bike' && edge.mode === 'walk') continue;
    const a = NODE_BY_ID.get(edge.from);
    const b = NODE_BY_ID.get(edge.to);
    if (!a || !b) continue;
    const w = distanceMeters(a, b);
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!adj.has(edge.to)) adj.set(edge.to, []);
    adj.get(edge.from)!.push({ to: edge.to, weight: w, edge });
    adj.get(edge.to)!.push({ to: edge.from, weight: w, edge });
  }

  const goalNode = NODE_BY_ID.get(e.nodeId)!;
  const gScore = new Map<string, number>([[s.nodeId, 0]]);
  const fScore = new Map<string, number>([[s.nodeId, distanceMeters(NODE_BY_ID.get(s.nodeId)!, goalNode)]]);
  const cameFrom = new Map<string, { prev: string; edge: CampusRoadEdge; dist: number }>();
  const open = new Set<string>([s.nodeId]);
  const closed = new Set<string>();

  while (open.size > 0) {
    let current = '';
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }
    if (current === e.nodeId) break;
    open.delete(current);
    closed.add(current);

    for (const { to, weight, edge } of adj.get(current) ?? []) {
      if (closed.has(to)) continue;
      const tentative = (gScore.get(current) ?? Infinity) + weight;
      if (tentative < (gScore.get(to) ?? Infinity)) {
        cameFrom.set(to, { prev: current, edge, dist: weight });
        gScore.set(to, tentative);
        fScore.set(to, tentative + distanceMeters(NODE_BY_ID.get(to)!, goalNode));
        open.add(to);
      }
    }
  }

  if (s.nodeId !== e.nodeId && !cameFrom.has(e.nodeId)) return null;

  // 回溯路径
  const nodeIds: string[] = [e.nodeId];
  const segments: { from: CampusRoadNode; to: CampusRoadNode; edge: CampusRoadEdge; dist: number }[] = [];
  let cursor = e.nodeId;
  while (cursor !== s.nodeId) {
    const link = cameFrom.get(cursor)!;
    const fromNode = NODE_BY_ID.get(link.prev)!;
    const toNode = NODE_BY_ID.get(cursor)!;
    segments.push({ from: fromNode, to: toNode, edge: link.edge, dist: link.dist });
    nodeIds.push(link.prev);
    cursor = link.prev;
  }
  nodeIds.reverse();
  segments.reverse();

  // 合并同名连续道路生成易读的中文分步指引
  const steps: RouteStep[] = [];
  const crossings: string[] = [];
  for (const seg of segments) {
    if (seg.edge.kind === 'tunnel' || seg.edge.kind === 'bridge') {
      crossings.push(seg.edge.roadName);
    }
    const dir = cardinalDirection(seg.from, seg.to);
    const prev = steps[steps.length - 1];
    if (prev && prev.roadName === seg.edge.roadName && !seg.edge.note && !prev.note) {
      prev.distanceMeters += seg.dist;
    } else {
      steps.push({
        roadName: seg.edge.roadName,
        direction: dir,
        distanceMeters: seg.dist,
        note: seg.edge.note,
      });
    }
  }

  const waypoints: { lat: number; lng: number }[] = [{ lat: s.lat, lng: s.lng }];
  for (const id of nodeIds) {
    const n = NODE_BY_ID.get(id)!;
    const last = waypoints[waypoints.length - 1]!;
    if (distanceMeters(last, n) > 8) waypoints.push({ lat: n.lat, lng: n.lng });
  }
  if (distanceMeters(waypoints[waypoints.length - 1]!, { lat: e.lat, lng: e.lng }) > 8) {
    waypoints.push({ lat: e.lat, lng: e.lng });
  }

  let totalMeters = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalMeters += distanceMeters(waypoints[i - 1]!, waypoints[i]!);
  }
  totalMeters = Math.round(totalMeters);

  return {
    mode,
    distanceMeters: totalMeters,
    durationMinutes: Math.max(1, Math.round(totalMeters / SPEED_M_PER_MIN[mode])),
    waypoints,
    steps: steps.map((st) => ({ ...st, distanceMeters: Math.round(st.distanceMeters) })),
    crossings,
  };
}

/** 计算当前位置到当前路线折线的最短垂直距离（米），用于偏航自动重算判断 */
export function distanceToRouteMeters(point: { lat: number; lng: number }, waypoints: { lat: number; lng: number }[]): number {
  if (waypoints.length === 0) return Infinity;
  const p = latLngToLocal(point.lat, point.lng);
  if (waypoints.length === 1) {
    const a = latLngToLocal(waypoints[0]!.lat, waypoints[0]!.lng);
    return Math.hypot(p.x - a.x, p.z - a.z);
  }
  let minD = Infinity;
  for (let i = 1; i < waypoints.length; i++) {
    const a = latLngToLocal(waypoints[i - 1]!.lat, waypoints[i - 1]!.lng);
    const b = latLngToLocal(waypoints[i]!.lat, waypoints[i]!.lng);
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / lenSq));
    const projX = a.x + t * vx;
    const projZ = a.z + t * vz;
    minD = Math.min(minD, Math.hypot(p.x - projX, p.z - projZ));
  }
  return minD;
}
