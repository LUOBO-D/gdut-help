import {
  GDUT_HEMC_BUILDINGS,
  GDUT_HEMC_FEATURES,
  GDUT_HEMC_ROAD_EDGES,
  GDUT_HEMC_ROAD_NODES,
  latLngToLocal,
  type BuildingCategory,
  type CampusBuilding,
  type CampusFeaturePolygon,
  type CampusRoutePlan,
} from '@gduthelp/shared';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { GeoFix } from '../../lib/location';
import type { CampusLightingPalette } from './campus-lighting';
import {
  createCampusTextureSet,
  UNIT_ARCH_CANOPY_GEO,
  UNIT_SEMICIRCLE_GEO,
  UNIT_STADIUM_CAPSULE_GEO,
  UNIT_TIERED_AUDITORIUM_GEO,
  type CampusTextureSet,
  type FacadeStyle,
} from './campus-textures';

export interface CameraTarget {
  x: number;
  z: number;
  distance?: number;
  /** 递增序号用于触发一次平滑飞抵动画 */
  seq: number;
}

export interface CameraControlApi {
  resetNorth: () => void;
  zoomBy: (factor: number) => void;
}

interface CampusScene3DProps {
  lighting: CampusLightingPalette;
  view3d: boolean;
  category: BuildingCategory;
  selectedId: string | null;
  route: CampusRoutePlan | null;
  routeStartLabel?: string;
  routeEndId: string | null;
  userFix: GeoFix | null;
  userInsideCampus: boolean;
  cameraTarget: CameraTarget | null;
  controlApiRef: MutableRefObject<CameraControlApi | null>;
  onSelectBuilding: (building: CampusBuilding) => void;
  onYawChange?: (yawRad: number) => void;
}

interface CameraState {
  x: number;
  z: number;
  distance: number;
  pitch: number;
  yaw: number;
  goalX: number;
  goalZ: number;
  goalDistance: number;
  goalYaw: number;
  dragging: boolean;
}

const ROAD_NODE_LOCAL = new Map(GDUT_HEMC_ROAD_NODES.map((n) => [n.id, latLngToLocal(n.lat, n.lng)]));
const BUILDING_LOCAL = new Map(GDUT_HEMC_BUILDINGS.map((b) => [b.id, latLngToLocal(b.lat, b.lng)]));
const BRIDGE_NORTH_LOCAL = ROAD_NODE_LOCAL.get('n-bridge-north')!;
const BRIDGE_SOUTH_LOCAL = ROAD_NODE_LOCAL.get('n-bridge-south')!;

/** 广工标志性绿化带/山坡/林荫道树冠点位（严格对齐 OSM WGS-84，3 个 InstancedMesh 绘制） */
const CAMPUS_TREE_CLUSTERS: { lat: number; lng: number; radius: number; count: number; baseY?: number }[] = [
  // 南二路公园 + 河涌两岸
  { lat: 23.0460, lng: 113.3848, radius: 64, count: 28 },
  { lat: 23.0445, lng: 113.3849, radius: 46, count: 18 },
  // 漠阳园（生活东区中部草坡）
  { lat: 23.0457, lng: 113.38825, radius: 52, count: 26, baseY: 9.5 },
  // 金银山（四饭/西17 南侧山丘）
  { lat: 23.04385, lng: 113.37955, radius: 52, count: 26, baseY: 11.5 },
  // 团结湖滨水景观带
  { lat: 23.0389, lng: 113.3882, radius: 34, count: 14 },
  { lat: 23.0375, lng: 113.3879, radius: 34, count: 12 },
  // 生活西区内部林荫道
  { lat: 23.0458, lng: 113.3808, radius: 52, count: 16 },
  // 中心体育场南侧林荫
  { lat: 23.0394, lng: 113.3852, radius: 52, count: 16 },
  // 图书馆前知行大道/勤奋广场绿化带
  { lat: 23.0403, lng: 113.3916, radius: 24, count: 10 },
];

/** 沿广工校园主干道整齐栽种的岭南行道树（知行大道、创新大道、明德路、中环西路南侧） */
const AVENUE_TREE_LINES: { from: [number, number]; to: [number, number]; step: number; offset: number }[] = [
  // 知行大道（教3/教5与图书馆之间）
  { from: [23.04072, 113.3876], to: [23.04072, 113.3948], step: 44, offset: 11 },
  // 创新大道（图书馆东侧→工大广场）
  { from: [23.0426, 113.39120], to: [23.0363, 113.39120], step: 48, offset: 11 },
  // 明德路（工学馆与实验楼之间）
  { from: [23.0426, 113.39344], to: [23.0367, 113.39344], step: 48, offset: 10 },
  // 中环西路南侧绿化带
  { from: [23.0433, 113.3834], to: [23.0439, 113.3932], step: 56, offset: 18 },
];

const CAMPUS_TREE_POSITIONS: [number, number, number, number][] = (() => {
  const out: [number, number, number, number][] = [];
  let seed = 202604;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const c of CAMPUS_TREE_CLUSTERS) {
    const base = latLngToLocal(c.lat, c.lng);
    for (let i = 0; i < c.count; i++) {
      const a = rand() * Math.PI * 2;
      const frac = Math.sqrt(rand());
      const r = frac * c.radius;
      const scale = 0.72 + rand() * 0.52;
      const elev = c.baseY ? c.baseY * Math.max(0.12, Math.cos(frac * Math.PI * 0.48)) : 0;
      out.push([base.x + Math.cos(a) * r, scale, base.z + Math.sin(a) * r, elev]);
    }
  }
  for (const line of AVENUE_TREE_LINES) {
    const a = latLngToLocal(line.from[0], line.from[1]);
    const b = latLngToLocal(line.to[0], line.to[1]);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    const steps = Math.max(2, Math.floor(len / line.step));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = a.x + dx * t + nx * line.offset;
      const pz = a.z + dz * t + nz * line.offset;
      out.push([px, 0.72 + rand() * 0.22, pz, 0]);
    }
  }
  return out;
})();

const ZONE_WATERMARKS = [
  { id: 'wm-west', label: '生活西区', lat: 23.0458, lng: 113.3806 },
  { id: 'wm-east', label: '生活东区', lat: 23.0454, lng: 113.3890 },
  { id: 'wm-teach', label: '教学区 · 教1-6', lat: 23.0418, lng: 113.3908 },
  { id: 'wm-lab', label: '工学馆 · 实验楼', lat: 23.0388, lng: 113.3936 },
  { id: 'wm-ring', label: '大学城中环西路', lat: 23.0436, lng: 113.3878 },
].map((w) => ({ ...w, local: latLngToLocal(w.lat, w.lng) }));

const CLAMP_X: [number, number] = [-1150, 950];
const CLAMP_Z: [number, number] = [-720, 740];
const MIN_DIST = 165;
const MAX_DIST = 2250;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** 根据地形多边形创建 3D 几何体（水系采用样条平滑，球场自动归一化顶面 UV） */
function buildPolygonGeometry(
  points: [number, number][],
  depth = 0.6,
  opts?: { smooth?: boolean; normalizeUv?: boolean },
): THREE.ExtrudeGeometry {
  const locals = points.map(([lat, lng]) => latLngToLocal(lat, lng));
  const shape = new THREE.Shape();

  if (opts?.smooth && locals.length >= 4) {
    // 真正闭合的 Catmull-Rom 周期样条，确保团结湖与南亭西街涌每个转角都丝滑圆润无尖角
    const pts3 = locals.map((p) => new THREE.Vector3(p.x, -p.z, 0));
    const curve = new THREE.CatmullRomCurve3(pts3, true, 'centripetal');
    const sampled = curve.getPoints(locals.length * 8);
    sampled.forEach((pt, idx) => {
      if (idx === 0) shape.moveTo(pt.x, pt.y);
      else shape.lineTo(pt.x, pt.y);
    });
    shape.closePath();
  } else {
    locals.forEach((p, idx) => {
      if (idx === 0) shape.moveTo(p.x, -p.z);
      else shape.lineTo(p.x, -p.z);
    });
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);

  if (opts?.normalizeUv) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const spanX = Math.max(1, bb.max.x - bb.min.x);
    const spanZ = Math.max(1, bb.max.z - bb.min.z);
    const pos = geo.attributes.position!;
    const uv = geo.attributes.uv!;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) - bb.min.x) / spanX, 1 - (pos.getZ(i) - bb.min.z) / spanZ);
    }
    uv.needsUpdate = true;
  }

  return geo;
}

/** 建筑立面与屋顶共享材质库（仅 ~12 个共享材质，零内存膨胀且屋顶绝不串出窗户） */
interface SharedBuildingMaterials {
  wall: Record<FacadeStyle, THREE.MeshStandardMaterial>;
  wallDimmed: Record<FacadeStyle, THREE.MeshStandardMaterial>;
  wallSelected: THREE.MeshStandardMaterial;
  roof: Record<Exclude<BuildingCategory, 'all'>, THREE.MeshStandardMaterial>;
  roofDimmed: Record<Exclude<BuildingCategory, 'all'>, THREE.MeshStandardMaterial>;
  roofSelected: THREE.MeshStandardMaterial;
  parapet: THREE.MeshStandardMaterial;
  plinth: THREE.MeshStandardMaterial;
  glassAtrium: THREE.MeshStandardMaterial;
  stadiumTop: THREE.MeshStandardMaterial;
  dispose: () => void;
}

function facadeStyleOf(cat: Exclude<BuildingCategory, 'all'>): FacadeStyle {
  switch (cat) {
    case 'teaching':
      return 'teaching';
    case 'lab':
      return 'lab';
    case 'dorm-west':
    case 'dorm-east':
      return 'dorm';
    case 'canteen':
      return 'canteen';
    case 'landmark':
    case 'sports':
      return 'landmark';
  }
}

function createBuildingMaterials(
  lighting: CampusLightingPalette,
  textures: CampusTextureSet,
): SharedBuildingMaterials {
  const styles: FacadeStyle[] = ['teaching', 'lab', 'dorm', 'landmark', 'canteen'];
  const cats: Exclude<BuildingCategory, 'all'>[] = [
    'teaching',
    'lab',
    'dorm-west',
    'dorm-east',
    'canteen',
    'landmark',
    'sports',
  ];

  const wall = {} as Record<FacadeStyle, THREE.MeshStandardMaterial>;
  const wallDimmed = {} as Record<FacadeStyle, THREE.MeshStandardMaterial>;
  const emiIntensity = lighting.windowGlow > 0.1 ? lighting.windowGlow * 0.95 : 0;

  for (const st of styles) {
    wall[st] = new THREE.MeshStandardMaterial({
      map: textures.facades[st],
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: textures.emissives[st],
      emissiveIntensity: emiIntensity,
      roughness: 0.62,
      metalness: 0.08,
    });
    wallDimmed[st] = new THREE.MeshStandardMaterial({
      map: textures.facades[st],
      roughness: 0.8,
      metalness: 0.02,
      transparent: true,
      opacity: 0.34,
    });
  }

  const wallSelected = new THREE.MeshStandardMaterial({
    color: '#ff966b',
    map: textures.facades.landmark,
    emissive: '#ff6f3d',
    emissiveIntensity: 0.32,
    roughness: 0.5,
    metalness: 0.08,
  });

  const roof = {} as Record<Exclude<BuildingCategory, 'all'>, THREE.MeshStandardMaterial>;
  const roofDimmed = {} as Record<Exclude<BuildingCategory, 'all'>, THREE.MeshStandardMaterial>;
  for (const cat of cats) {
    roof[cat] = new THREE.MeshStandardMaterial({
      color: lighting.buildingColors[cat],
      roughness: 0.72,
      metalness: 0.04,
    });
    roofDimmed[cat] = new THREE.MeshStandardMaterial({
      color: lighting.buildingColors[cat],
      roughness: 0.85,
      transparent: true,
      opacity: 0.34,
    });
  }

  const roofSelected = new THREE.MeshStandardMaterial({
    color: '#ffa27a',
    emissive: '#ff7043',
    emissiveIntensity: 0.28,
    roughness: 0.52,
  });

  const parapet = new THREE.MeshStandardMaterial({
    color: lighting.isDark ? '#587196' : '#dfe6ee',
    roughness: 0.65,
    metalness: 0.05,
  });

  const plinth = new THREE.MeshStandardMaterial({
    color: lighting.isDark ? '#25344f' : '#cfd6de',
    roughness: 0.86,
    metalness: 0.02,
  });

  const glassAtrium = new THREE.MeshStandardMaterial({
    color: lighting.isDark ? '#7ec4ff' : '#9ad5f5',
    emissive: lighting.isDark ? '#88cbff' : '#2563eb',
    emissiveIntensity: lighting.isDark ? 0.65 : 0.08,
    roughness: 0.18,
    metalness: 0.25,
    transparent: true,
    opacity: 0.88,
  });

  const stadiumTop = new THREE.MeshStandardMaterial({
    map: textures.stadiumTop,
    roughness: 0.82,
    metalness: 0.02,
  });

  return {
    wall,
    wallDimmed,
    wallSelected,
    roof,
    roofDimmed,
    roofSelected,
    parapet,
    plinth,
    glassAtrium,
    stadiumTop,
    dispose: () => {
      for (const st of styles) {
        wall[st].dispose();
        wallDimmed[st].dispose();
      }
      for (const cat of cats) {
        roof[cat].dispose();
        roofDimmed[cat].dispose();
      }
      wallSelected.dispose();
      roofSelected.dispose();
      parapet.dispose();
      plinth.dispose();
      glassAtrium.dispose();
      stadiumTop.dispose();
    },
  };
}

/** 校园地形块（柔化湖河、分层草坡、精细篮球场、多层次阔叶林木） */
function CampusFeatures({
  lighting,
  textures,
}: {
  lighting: CampusLightingPalette;
  textures: CampusTextureSet;
}) {
  const meshes = useMemo(() => {
    return GDUT_HEMC_FEATURES.map((f) => {
      if (f.kind === 'hill') {
        const pts = f.points.map(([lat, lng]) => latLngToLocal(lat, lng));
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
        const rx = Math.max(...pts.map((p) => Math.abs(p.x - cx))) * 1.15;
        const rz = Math.max(...pts.map((p) => Math.abs(p.z - cz))) * 1.15;
        return { f, type: 'hill' as const, cx, cz, rx, rz };
      }
      const y = f.kind === 'water' ? 0.32 : f.kind === 'court' ? 0.55 : f.kind === 'plaza' ? 0.45 : 0.18;
      const geo = buildPolygonGeometry(f.points, f.kind === 'water' ? 0.42 : 0.36, {
        smooth: f.kind === 'water',
        normalizeUv: f.kind === 'court',
      });
      return { f, type: 'poly' as const, geo, y };
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const m of meshes) {
        if (m.type === 'poly') m.geo.dispose();
      }
    };
  }, [meshes]);

  // 多层次阔叶树冠：树干 + 主绿冠 + 阳面亮绿副冠（3 次 InstancedMesh）
  const treeTrunkRef = useRef<THREE.InstancedMesh>(null);
  const treeMainCrownRef = useRef<THREE.InstancedMesh>(null);
  const treeTopCrownRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!treeTrunkRef.current || !treeMainCrownRef.current || !treeTopCrownRef.current) return;
    const dummy = new THREE.Object3D();
    CAMPUS_TREE_POSITIONS.forEach(([x, s, z, elev], idx) => {
      // 树干
      dummy.position.set(x, elev + 2.8 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, idx * 1.1, 0);
      dummy.updateMatrix();
      treeTrunkRef.current!.setMatrixAt(idx, dummy.matrix);

      // 主树冠（饱满圆润低多边形阔叶球）
      dummy.position.set(x, elev + 7.4 * s, z);
      dummy.scale.set(s * 1.15, s * 0.92, s * 1.15);
      dummy.rotation.set(0, idx * 0.7, 0);
      dummy.updateMatrix();
      treeMainCrownRef.current!.setMatrixAt(idx, dummy.matrix);

      // 阳面次冠层（略偏右上形成丰富立体明暗）
      dummy.position.set(x + 1.8 * s, elev + 10.2 * s, z - 1.2 * s);
      dummy.scale.set(s * 0.78, s * 0.72, s * 0.78);
      dummy.rotation.set(0, idx * 1.7, 0);
      dummy.updateMatrix();
      treeTopCrownRef.current!.setMatrixAt(idx, dummy.matrix);
    });
    treeTrunkRef.current.instanceMatrix.needsUpdate = true;
    treeMainCrownRef.current.instanceMatrix.needsUpdate = true;
    treeTopCrownRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  const colorOf = (f: CampusFeaturePolygon) => {
    switch (f.kind) {
      case 'water':
        return lighting.waterColor;
      case 'park':
        return lighting.parkColor;
      case 'hill':
        return lighting.hillColor;
      case 'court':
        return lighting.courtColor;
      case 'plaza':
        return lighting.plazaColor;
      case 'village':
        return lighting.villageColor;
    }
  };

  return (
    <group>
      {/* 校园大片底层地基 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-80, -0.35, 0]} receiveShadow>
        <planeGeometry args={[3000, 2400]} />
        <meshStandardMaterial color={lighting.groundColor} roughness={0.96} metalness={0} />
      </mesh>

      {/* 柔和极淡校园尺度底纹（不再有生硬 CAD 线条感） */}
      <gridHelper
        args={[2400, 20, lighting.isDark ? '#1e304f' : '#d8e0d6', lighting.isDark ? '#192742' : '#e4eae2']}
        position={[-80, 0.02, 0]}
      />

      {meshes.map((m) =>
        m.type === 'hill' ? (
          // 双层柔和山坡等高线（金银山 & 漠阳园）
          <group key={m.f.id} position={[m.cx, 0, m.cz]}>
            <mesh scale={[m.rx * 1.04, (m.f.elevation ?? 16) * 0.65, m.rz * 1.04]} receiveShadow>
              <sphereGeometry args={[1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={lighting.parkColor} roughness={0.94} />
            </mesh>
            <mesh scale={[m.rx * 0.84, m.f.elevation ?? 16, m.rz * 0.84]} receiveShadow>
              <sphereGeometry args={[1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={colorOf(m.f)} roughness={0.92} />
            </mesh>
          </group>
        ) : m.f.kind === 'water' ? (
          // 柔和样条水系（带浅色驳岸镶边 + 镜面光泽水面）
          <group key={m.f.id}>
            <mesh geometry={m.geo} position={[0, m.y - 0.14, 0]} scale={[1.012, 1, 1.012]} receiveShadow>
              <meshStandardMaterial color={lighting.isDark ? '#263854' : '#d9d4c7'} roughness={0.9} />
            </mesh>
            <mesh geometry={m.geo} position={[0, m.y, 0]} receiveShadow>
              <meshStandardMaterial
                color={lighting.waterColor}
                roughness={0.14}
                metalness={0.28}
              />
            </mesh>
          </group>
        ) : m.f.kind === 'court' ? (
          // B/C 区标准画线露天篮球场
          <mesh key={m.f.id} geometry={m.geo} position={[0, m.y, 0]} receiveShadow>
            <meshStandardMaterial map={textures.basketballCourt} roughness={0.78} metalness={0.02} />
          </mesh>
        ) : (
          <mesh key={m.f.id} geometry={m.geo} position={[0, m.y, 0]} receiveShadow>
            <meshStandardMaterial color={colorOf(m.f)} roughness={0.92} metalness={0} />
          </mesh>
        ),
      )}

      {/* 多层次校园阔叶林木（3 个 InstancedMesh，饱满自然） */}
      <instancedMesh ref={treeTrunkRef} args={[undefined, undefined, CAMPUS_TREE_POSITIONS.length]}>
        <cylinderGeometry args={[0.75, 1.25, 5.8, 5]} />
        <meshStandardMaterial color={lighting.isDark ? '#3a2f2a' : '#85674f'} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={treeMainCrownRef} args={[undefined, undefined, CAMPUS_TREE_POSITIONS.length]} castShadow>
        <icosahedronGeometry args={[5.2, 1]} />
        <meshStandardMaterial color={lighting.isDark ? '#1a4a3c' : '#58a363'} roughness={0.88} />
      </instancedMesh>
      <instancedMesh ref={treeTopCrownRef} args={[undefined, undefined, CAMPUS_TREE_POSITIONS.length]}>
        <icosahedronGeometry args={[4.4, 1]} />
        <meshStandardMaterial color={lighting.isDark ? '#246350' : '#7ac278'} roughness={0.85} />
      </instancedMesh>
    </group>
  );
}

/** 广工真实路网 + 路口圆弧衔接 + 拱顶广工人行天桥 + 挑战路隧道洞口 + 夜间路灯柱与暖光 */
function CampusRoads({ lighting }: { lighting: CampusLightingPalette }) {
  const segments = useMemo(() => {
    return GDUT_HEMC_ROAD_EDGES.map((edge, idx) => {
      const a = ROAD_NODE_LOCAL.get(edge.from);
      const b = ROAD_NODE_LOCAL.get(edge.to);
      if (!a || !b) return null;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const cx = (a.x + b.x) / 2;
      const cz = (a.z + b.z) / 2;
      const angle = Math.atan2(dx, dz);
      const width =
        edge.kind === 'ring'
          ? 24
          : edge.kind === 'main'
            ? 14
            : edge.kind === 'tunnel'
              ? 16
              : edge.kind === 'bridge'
                ? 8.5
                : edge.kind === 'campus'
                  ? 9.5
                  : 5.5;
      return { id: `${edge.from}-${edge.to}-${idx}`, edge, cx, cz, len, angle, width };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, []);

  // 路口圆形衔接垫片（消除折线道路转角缺口）
  const junctionCaps = useMemo(() => {
    const map = new Map<string, { x: number; z: number; radius: number; isRing: boolean }>();
    for (const seg of segments) {
      if (seg.edge.kind === 'bridge' || seg.edge.kind === 'path') continue;
      for (const id of [seg.edge.from, seg.edge.to]) {
        const pt = ROAD_NODE_LOCAL.get(id);
        if (!pt) continue;
        const r = seg.width * 0.52;
        const prev = map.get(id);
        if (!prev || r > prev.radius) {
          map.set(id, { x: pt.x, z: pt.z, radius: r, isRing: seg.edge.kind === 'ring' });
        }
      }
    }
    return Array.from(map.values());
  }, [segments]);

  const lampPositions = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (const seg of segments) {
      if (seg.edge.kind !== 'ring' && seg.edge.kind !== 'main' && seg.edge.kind !== 'tunnel') continue;
      const count = Math.max(1, Math.floor(seg.len / 72));
      const a = ROAD_NODE_LOCAL.get(seg.edge.from)!;
      const b = ROAD_NODE_LOCAL.get(seg.edge.to)!;
      for (let i = 1; i <= count; i++) {
        const t = i / (count + 1);
        pts.push([a.x + (b.x - a.x) * t, 7.6, a.z + (b.z - a.z) * t]);
      }
    }
    return pts;
  }, [segments]);

  const lampGlobeRef = useRef<THREE.InstancedMesh>(null);
  const lampPoleRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    if (!lampGlobeRef.current || !lampPoleRef.current) return;
    const dummy = new THREE.Object3D();
    lampPositions.forEach(([x, y, z], i) => {
      dummy.position.set(x, y, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lampGlobeRef.current!.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y * 0.48, z);
      dummy.updateMatrix();
      lampPoleRef.current!.setMatrixAt(i, dummy.matrix);
    });
    lampGlobeRef.current.instanceMatrix.needsUpdate = true;
    lampPoleRef.current.instanceMatrix.needsUpdate = true;
  }, [lampPositions]);

  const roadColor = (kind: (typeof segments)[number]['edge']['kind']) => {
    switch (kind) {
      case 'ring':
        return lighting.roadRingColor;
      case 'main':
        return lighting.roadMainColor;
      case 'campus':
        return lighting.roadCampusColor;
      case 'path':
        return lighting.roadPathColor;
      case 'bridge':
        return lighting.bridgeColor;
      case 'tunnel':
        return lighting.tunnelColor;
    }
  };

  const curbColor = lighting.isDark ? '#1d2b44' : '#cfd7e0';
  const ringDividerColor = lighting.isDark ? '#ffda8f' : '#ffffff';
  const mainDividerColor = lighting.isDark ? '#7da3d9' : '#c5d1de';

  return (
    <group>
      {segments.map((s) => {
        if (s.edge.kind === 'bridge') {
          // 广工人行天桥：拱形遮雨棚 + 透明护栏 + 混凝土桥墩 + 两端阶梯引桥
          return (
            <group key={s.id} position={[s.cx, 0, s.cz]} rotation={[0, s.angle, 0]}>
              {/* 桥面主梁 */}
              <mesh position={[0, 8.6, 0]} castShadow receiveShadow>
                <boxGeometry args={[s.width, 1.5, s.len + 6]} />
                <meshStandardMaterial color={lighting.isDark ? '#9c7853' : '#e8dcc8'} roughness={0.55} />
              </mesh>
              {/* 东西两侧半透明护栏 */}
              <mesh position={[-s.width * 0.45, 10.3, 0]}>
                <boxGeometry args={[0.6, 1.9, s.len + 4]} />
                <meshStandardMaterial
                  color={lighting.isDark ? '#7ec4ff' : '#bae6fd'}
                  transparent
                  opacity={0.72}
                  roughness={0.25}
                />
              </mesh>
              <mesh position={[s.width * 0.45, 10.3, 0]}>
                <boxGeometry args={[0.6, 1.9, s.len + 4]} />
                <meshStandardMaterial
                  color={lighting.isDark ? '#7ec4ff' : '#bae6fd'}
                  transparent
                  opacity={0.72}
                  roughness={0.25}
                />
              </mesh>
              {/* 标志性弧形白色钢构遮雨顶棚 */}
              <mesh
                geometry={UNIT_ARCH_CANOPY_GEO}
                position={[0, 12.2, 0]}
                scale={[s.width + 1.6, 3.8, s.len + 2]}
                castShadow
              >
                <meshStandardMaterial
                  color={lighting.isDark ? '#7f9bbd' : '#f8fafc'}
                  emissive={lighting.isDark ? '#ffcf7d' : '#000000'}
                  emissiveIntensity={lighting.isDark ? 0.16 : 0}
                  roughness={0.4}
                  metalness={0.2}
                />
              </mesh>
              {/* 桥墩立柱 */}
              {[-0.36, 0.36].map((f) => (
                <mesh key={f} position={[0, 4.3, s.len * f]} castShadow>
                  <cylinderGeometry args={[1.6, 2.2, 8.6, 10]} />
                  <meshStandardMaterial color={lighting.isDark ? '#586e8c' : '#cbd5e1'} roughness={0.75} />
                </mesh>
              ))}
              {/* 两端坡道引桥 */}
              <mesh position={[0, 4.3, -s.len * 0.54]} rotation={[0.38, 0, 0]}>
                <boxGeometry args={[s.width * 0.72, 1.2, 18]} />
                <meshStandardMaterial color={lighting.bridgeColor} roughness={0.7} />
              </mesh>
              <mesh position={[0, 4.3, s.len * 0.54]} rotation={[-0.38, 0, 0]}>
                <boxGeometry args={[s.width * 0.72, 1.2, 18]} />
                <meshStandardMaterial color={lighting.bridgeColor} roughness={0.7} />
              </mesh>
            </group>
          );
        }

        if (s.edge.kind === 'tunnel') {
          // 挑战路下穿隧道：深蓝隧道通道 + 南北双向混凝土隧道洞口门框
          return (
            <group key={s.id} position={[s.cx, 0, s.cz]} rotation={[0, s.angle, 0]}>
              <mesh position={[0, 0.72, 0]} receiveShadow>
                <boxGeometry args={[s.width, 0.45, s.len + 8]} />
                <meshStandardMaterial color={lighting.tunnelColor} roughness={0.68} />
              </mesh>
              {/* 南北隧道洞口顶梁 */}
              {[-0.34, 0.34].map((f) => (
                <group key={f} position={[0, 0, s.len * f]}>
                  <mesh position={[0, 3.6, 0]} castShadow>
                    <boxGeometry args={[s.width + 3, 2.2, 4.2]} />
                    <meshStandardMaterial color={lighting.isDark ? '#4a648a' : '#dbe3ed'} roughness={0.65} />
                  </mesh>
                  <mesh position={[-s.width * 0.5 - 0.5, 1.8, 0]}>
                    <boxGeometry args={[2, 3.6, 4.2]} />
                    <meshStandardMaterial color={lighting.isDark ? '#3a5275' : '#c7d2df'} roughness={0.75} />
                  </mesh>
                  <mesh position={[s.width * 0.5 + 0.5, 1.8, 0]}>
                    <boxGeometry args={[2, 3.6, 4.2]} />
                    <meshStandardMaterial color={lighting.isDark ? '#3a5275' : '#c7d2df'} roughness={0.75} />
                  </mesh>
                </group>
              ))}
            </group>
          );
        }

        const y = s.edge.kind === 'ring' ? 0.96 : s.edge.kind === 'main' ? 0.86 : 0.78;
        const showCurb = s.edge.kind === 'ring' || s.edge.kind === 'main';
        return (
          <group key={s.id} position={[s.cx, 0, s.cz]} rotation={[0, s.angle, 0]}>
            {showCurb && (
              <mesh position={[0, y - 0.14, 0]} receiveShadow>
                <boxGeometry args={[s.width + 3.4, 0.36, s.len + s.width * 0.3]} />
                <meshStandardMaterial color={curbColor} roughness={0.9} />
              </mesh>
            )}
            <mesh position={[0, y, 0]} receiveShadow>
              <boxGeometry args={[s.width, 0.42, s.len + s.width * 0.25]} />
              <meshStandardMaterial color={roadColor(s.edge.kind)} roughness={0.82} />
            </mesh>
            {/* 大学城中环西路双中线 / 主干道中轴标线 */}
            {s.edge.kind === 'ring' && (
              <>
                <mesh position={[-1.1, y + 0.24, 0]}>
                  <boxGeometry args={[0.75, 0.08, s.len]} />
                  <meshBasicMaterial color={ringDividerColor} transparent opacity={0.72} />
                </mesh>
                <mesh position={[1.1, y + 0.24, 0]}>
                  <boxGeometry args={[0.75, 0.08, s.len]} />
                  <meshBasicMaterial color={ringDividerColor} transparent opacity={0.72} />
                </mesh>
              </>
            )}
            {s.edge.kind === 'main' && (
              <mesh position={[0, y + 0.23, 0]}>
                <boxGeometry args={[0.65, 0.06, s.len * 0.92]} />
                <meshBasicMaterial color={mainDividerColor} transparent opacity={0.55} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* 路口平滑圆盘衔接 */}
      {junctionCaps.map((cap, idx) => (
        <mesh key={idx} rotation={[-Math.PI / 2, 0, 0]} position={[cap.x, cap.isRing ? 1.18 : 1.07, cap.z]}>
          <circleGeometry args={[cap.radius, 14]} />
          <meshStandardMaterial color={cap.isRing ? lighting.roadRingColor : lighting.roadMainColor} roughness={0.82} />
        </mesh>
      ))}

      {/* 夜间/黄昏路灯杆与暖光灯球（常驻挂载并切换 visible，避免昼夜切换丢矩阵） */}
      <instancedMesh
        ref={lampPoleRef}
        visible={lighting.lampGlow > 0.05}
        args={[undefined, undefined, lampPositions.length]}
      >
        <cylinderGeometry args={[0.35, 0.45, 7.2, 5]} />
        <meshStandardMaterial color="#3c4c66" roughness={0.7} />
      </instancedMesh>
      <instancedMesh
        ref={lampGlobeRef}
        visible={lighting.lampGlow > 0.05}
        args={[undefined, undefined, lampPositions.length]}
      >
        <sphereGeometry args={[2.0, 8, 8]} />
        <meshBasicMaterial color="#ffe09e" transparent opacity={Math.max(0.01, lighting.lampGlow * 0.9)} />
      </instancedMesh>
    </group>
  );
}

/** 选中建筑上方轻柔上下悬浮的定位标（仅选中态 1 个实例参与动画，极省性能） */
function SelectedPin({ height }: { height: number }) {
  const pinRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pinRef.current) return;
    pinRef.current.position.y = height + 12 + Math.sin(clock.getElapsedTime() * 3.2) * 2.4;
    pinRef.current.rotation.y = clock.getElapsedTime() * 1.4;
  });
  return (
    <mesh ref={pinRef} position={[0, height + 12, 0]} rotation={[Math.PI, 0, 0]}>
      <coneGeometry args={[5.5, 11.5, 4]} />
      <meshStandardMaterial color="#ff6b35" emissive="#ff8052" emissiveIntensity={0.68} roughness={0.3} />
    </mesh>
  );
}

/** 精细化 3D 校园标志建筑（全 8 类造型 + 程序化窗户/阳台立面 + 屋顶细节 + 岭南架空层/连廊） */
function BuildingMesh({
  building,
  lighting,
  mats,
  selected,
  dimmed,
  onSelect,
}: {
  building: CampusBuilding;
  lighting: CampusLightingPalette;
  mats: SharedBuildingMaterials;
  selected: boolean;
  dimmed: boolean;
  onSelect: (b: CampusBuilding) => void;
}) {
  const pos = BUILDING_LOCAL.get(building.id)!;
  const { width: w, depth: d, height: h, category } = building;
  const style = facadeStyleOf(category);

  const wallMat = selected ? mats.wallSelected : dimmed ? mats.wallDimmed[style] : mats.wall[style];
  const roofMat = selected ? mats.roofSelected : dimmed ? mats.roofDimmed[category] : mats.roof[category];
  // 6 面材质数组：[+x 墙, -x 墙, +y 屋顶, -y 底, +z 墙, -z 墙]，确保窗户绝不串上屋顶
  const boxMats = useMemo(
    () => [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat],
    [roofMat, wallMat],
  );
  // ExtrudeGeometry 材质组：[0=顶底屋面, 1=立面外墙]
  const extrudeMats = useMemo(() => [roofMat, wallMat], [roofMat, wallMat]);
  // CylinderGeometry 材质组：[0=侧面幕墙, 1=顶面, 2=底面]
  const cylMats = useMemo(() => [wallMat, roofMat, roofMat], [roofMat, wallMat]);
  const stadiumMats = useMemo(() => [mats.stadiumTop, mats.plinth], [mats.plinth, mats.stadiumTop]);

  const isDorm = category === 'dorm-west' || category === 'dorm-east';
  const isLab = category === 'lab';
  const isCanteen = category === 'canteen';

  return (
    <group
      position={[pos.x, 0.9, pos.z]}
      rotation={[0, building.rotation ?? 0, 0]}
      onClick={(e) => {
        if (e.delta > 6) return;
        e.stopPropagation();
        onSelect(building);
      }}
    >
      {building.shape === 'courtyard' ? (
        // 广工图书馆：回字形大气主楼 + 阶梯基座 + 顶层退台女儿墙 + 采光玻璃中庭 + 北侧宏伟入口台阶
        <>
          {/* 广场基座台地 */}
          <mesh position={[0, 1.1, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 10, 2.2, d + 10]} />
          </mesh>
          {/* 北侧大台阶 */}
          <mesh position={[0, 1.2, -d * 0.56]} material={mats.parapet} receiveShadow>
            <boxGeometry args={[w * 0.44, 2.4, 8]} />
          </mesh>
          {/* 回字形四翼主体 */}
          <mesh position={[0, h / 2 + 1.5, -d * 0.36]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d * 0.28]} />
          </mesh>
          <mesh position={[0, h / 2 + 1.5, d * 0.36]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d * 0.28]} />
          </mesh>
          <mesh position={[-w * 0.36, h / 2 + 1.5, 0]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w * 0.28, h, d * 0.44]} />
          </mesh>
          <mesh position={[w * 0.36, h / 2 + 1.5, 0]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w * 0.28, h, d * 0.44]} />
          </mesh>
          {/* 屋顶大气白色女儿墙檐口框架 */}
          <mesh position={[0, h + 2.2, -d * 0.36]} material={mats.parapet}>
            <boxGeometry args={[w + 2.4, 1.5, d * 0.3]} />
          </mesh>
          <mesh position={[0, h + 2.2, d * 0.36]} material={mats.parapet}>
            <boxGeometry args={[w + 2.4, 1.5, d * 0.3]} />
          </mesh>
          <mesh position={[-w * 0.36, h + 2.2, 0]} material={mats.parapet}>
            <boxGeometry args={[w * 0.3, 1.5, d * 0.44]} />
          </mesh>
          <mesh position={[w * 0.36, h + 2.2, 0]} material={mats.parapet}>
            <boxGeometry args={[w * 0.3, 1.5, d * 0.44]} />
          </mesh>
          {/* 中庭通透采光玻璃顶 + 金字塔天窗 */}
          <mesh position={[0, 8, 0]} material={mats.glassAtrium}>
            <boxGeometry args={[w * 0.44, 10, d * 0.44]} />
          </mesh>
          <mesh position={[0, 15.5, 0]} rotation={[0, Math.PI / 4, 0]} material={mats.glassAtrium}>
            <coneGeometry args={[w * 0.28, 7, 4]} />
          </mesh>
        </>
      ) : building.shape === 'matrix' ? (
        // 广工教学楼群 教1–教6：南北双翼 + 真实架空空中连廊 + 悬挑遮阳屋檐 + 屋顶楼梯间
        <>
          <mesh position={[0, 0.7, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 4, 1.4, d + 4]} />
          </mesh>
          {/* 南北双翼教学楼 */}
          <mesh position={[0, h / 2 + 1, -d * 0.29]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d * 0.35]} />
          </mesh>
          <mesh position={[0, h / 2 + 1, d * 0.29]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d * 0.35]} />
          </mesh>
          {/* 标志性双层空中连廊（底层架空通透） */}
          {[-w * 0.27, w * 0.27].map((xOff) => (
            <group key={xOff} position={[xOff, 0, 0]}>
              <mesh position={[0, h * 0.62, 0]} material={boxMats} castShadow>
                <boxGeometry args={[w * 0.16, h * 0.48, d * 0.26]} />
              </mesh>
              {/* 连廊落地支撑柱 */}
              <mesh position={[0, h * 0.19, 0]} material={mats.parapet}>
                <cylinderGeometry args={[1.6, 1.8, h * 0.38, 8]} />
              </mesh>
            </group>
          ))}
          {/* 悬挑遮阳屋檐 + 屋顶楼梯间 */}
          <mesh position={[0, h + 1.5, -d * 0.29]} material={mats.parapet} castShadow>
            <boxGeometry args={[w + 2.6, 1.3, d * 0.39]} />
          </mesh>
          <mesh position={[0, h + 1.5, d * 0.29]} material={mats.parapet} castShadow>
            <boxGeometry args={[w + 2.6, 1.3, d * 0.39]} />
          </mesh>
          <mesh position={[0, h + 3.2, -d * 0.29]} material={roofMat}>
            <boxGeometry args={[w * 0.26, 2.4, d * 0.2]} />
          </mesh>
          <mesh position={[0, h + 3.2, d * 0.29]} material={roofMat}>
            <boxGeometry args={[w * 0.26, 2.4, d * 0.2]} />
          </mesh>
        </>
      ) : building.shape === 'tiered' ? (
        // 一/三/四号大教室：真实阶梯坡屋顶报告厅 + 悬挑斜屋面板 + 玻璃前厅
        <>
          <mesh position={[0, 0.7, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 4, 1.4, d + 4]} />
          </mesh>
          <mesh
            geometry={UNIT_TIERED_AUDITORIUM_GEO}
            position={[0, 1.4, 0]}
            scale={[w, h, d]}
            material={wallMat}
            castShadow
            receiveShadow
          />
          {/* 悬挑现代斜屋面板（盖住坡顶避免贴图拉扯） */}
          <mesh
            position={[0, h * 0.82 + 1.8, 0]}
            rotation={[0, 0, Math.atan2(-0.36 * h, w)]}
            material={mats.parapet}
            castShadow
          >
            <boxGeometry args={[Math.hypot(w, 0.36 * h) + 2.8, 1.2, d + 2.4]} />
          </mesh>
          {/* 前厅玻璃门廊 */}
          <mesh position={[w * 0.46, h * 0.34, 0]} material={mats.glassAtrium}>
            <boxGeometry args={[3.5, h * 0.56, d * 0.72]} />
          </mesh>
        </>
      ) : building.shape === 'semicircle' ? (
        // 东区二饭 / 大讲堂：水密实心半圆厅（顶面纯屋顶、弧墙立面窗）+ 悬挑弧形屋檐 + 退台采光圆厅
        <>
          <mesh
            geometry={UNIT_SEMICIRCLE_GEO}
            position={[0, 0, d * 0.24]}
            scale={[Math.max(w, d) * 1.06, 1.6, Math.max(w, d) * 1.06]}
            material={mats.plinth}
            receiveShadow
          />
          <mesh
            geometry={UNIT_SEMICIRCLE_GEO}
            position={[0, 1.6, d * 0.24]}
            scale={[Math.max(w, d), h * 0.84, Math.max(w, d)]}
            material={extrudeMats}
            castShadow
            receiveShadow
          />
          {/* 悬挑弧形大屋檐 */}
          <mesh
            geometry={UNIT_SEMICIRCLE_GEO}
            position={[0, h * 0.84 + 1.4, d * 0.25]}
            scale={[Math.max(w, d) * 1.08, 1.4, Math.max(w, d) * 1.08]}
            material={mats.parapet}
            castShadow
          />
          {/* 退台顶层采光厅 */}
          <mesh
            geometry={UNIT_SEMICIRCLE_GEO}
            position={[0, h * 0.84 + 2.8, d * 0.2]}
            scale={[Math.max(w, d) * 0.62, h * 0.26, Math.max(w, d) * 0.62]}
            material={roofMat}
            castShadow
          />
        </>
      ) : building.shape === 'dome' ? (
        // 广工体育馆（亚运场馆）：圆形广场台地 + 玻璃幕墙裙房 + 银白大跨度穹顶 + 屋面交叉钢肋拱
        <>
          <mesh position={[0, 1.2, 0]} material={mats.plinth} receiveShadow>
            <cylinderGeometry args={[Math.max(w, d) * 0.56, Math.max(w, d) * 0.59, 2.4, 28]} />
          </mesh>
          <mesh position={[0, h * 0.34 + 2, 0]} material={cylMats} castShadow receiveShadow>
            <cylinderGeometry args={[Math.max(w, d) * 0.49, Math.max(w, d) * 0.51, h * 0.68, 28]} />
          </mesh>
          {/* 屋檐圆环挑梁 */}
          <mesh position={[0, h * 0.68 + 2.2, 0]} material={mats.parapet}>
            <cylinderGeometry args={[Math.max(w, d) * 0.53, Math.max(w, d) * 0.52, 1.5, 28]} />
          </mesh>
          {/* 标志性银白椭圆大穹顶 */}
          <mesh position={[0, h * 0.68 + 2.4, 0]} scale={[w * 0.52, h * 0.52, d * 0.52]} castShadow>
            <sphereGeometry args={[1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color={selected ? '#ffad8a' : lighting.isDark ? '#4a738f' : '#eef5f9'}
              roughness={0.35}
              metalness={0.22}
            />
          </mesh>
          {/* 穹顶交叉结构钢拱肋 */}
          {[0, Math.PI / 2].map((rot) => (
            <mesh
              key={rot}
              position={[0, h * 0.68 + 2.5, 0]}
              rotation={[0, rot, 0]}
              scale={[w * 0.53, h * 0.54, 1.8]}
              material={mats.parapet}
            >
              <torusGeometry args={[1, 0.045, 8, 28, Math.PI]} />
            </mesh>
          ))}
        </>
      ) : building.shape === 'stadium' ? (
        // 中心体育场：圆弧胶囊形 6 跑道红塑胶 + 条纹绿茵球场 + 悬挑白棚西看台 + 四角球场照明高杆灯
        <>
          <mesh
            geometry={UNIT_STADIUM_CAPSULE_GEO}
            position={[0, 0.2, 0]}
            scale={[w, 1.5, d]}
            material={stadiumMats}
            receiveShadow
          />
          {/* 西侧双阶看台 + 标志性白色弧形悬挑看台雨棚 */}
          <mesh position={[-w * 0.48, 3.8, 0]} material={mats.plinth} castShadow>
            <boxGeometry args={[10, 7.6, d * 0.62]} />
          </mesh>
          <mesh position={[-w * 0.44, 8.8, 0]} rotation={[0, 0, -0.18]} material={mats.parapet} castShadow>
            <boxGeometry args={[14, 1.2, d * 0.66]} />
          </mesh>
          {/* 四角田径场高杆照明灯塔（夜间亮起柔光灯头） */}
          {[
            [-w * 0.48, -d * 0.42],
            [w * 0.48, -d * 0.42],
            [-w * 0.48, d * 0.42],
            [w * 0.48, d * 0.42],
          ].map(([lx, lz], idx) => (
            <group key={idx} position={[lx, 0, lz]}>
              <mesh position={[0, 12, 0]}>
                <cylinderGeometry args={[0.55, 0.9, 24, 6]} />
                <meshStandardMaterial color={lighting.isDark ? '#586d8a' : '#b8c4d1'} roughness={0.6} />
              </mesh>
              <mesh position={[0, 24.4, 0]}>
                <boxGeometry args={[4.2, 1.8, 1.6]} />
                <meshStandardMaterial
                  color={lighting.isDark ? '#fff5d6' : '#e2e8f0'}
                  emissive={lighting.isDark ? '#ffe39c' : '#000000'}
                  emissiveIntensity={lighting.isDark ? 1.15 : 0}
                />
              </mesh>
            </group>
          ))}
        </>
      ) : building.shape === 'gate' ? (
        // 广工大学城正门（工大广场）：四柱仪仗门廊 + 宽阔门楼顶梁 + 入口阶梯广场
        <>
          <mesh position={[0, 0.8, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 14, 1.6, d + 10]} />
          </mesh>
          {[-w * 0.36, -w * 0.14, w * 0.14, w * 0.36].map((px) => (
            <mesh key={px} position={[px, h * 0.5 + 1.2, 0]} material={mats.parapet} castShadow>
              <boxGeometry args={[5.5, h, 7.5]} />
            </mesh>
          ))}
          {/* 标志性宽顶横梁 */}
          <mesh position={[0, h + 2.4, 0]} castShadow>
            <boxGeometry args={[w + 4, 3.2, 11]} />
            <meshStandardMaterial
              color={selected ? '#ff8b5e' : lighting.isDark ? '#8c4c47' : '#d66853'}
              roughness={0.55}
            />
          </mesh>
          <mesh position={[0, h + 4.3, 0]} material={mats.parapet}>
            <boxGeometry args={[w + 6, 0.9, 12]} />
          </mesh>
        </>
      ) : isDorm ? (
        // 东西区学生宿舍：岭南底层架空层 + 阳台立面纹理 + 女儿墙压顶 + 双楼梯间/水箱间
        <>
          {/* 底层微退进架空层 */}
          <mesh position={[0, 2.2, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w - 2.4, 4.4, d - 2.4]} />
          </mesh>
          {/* 主体宿舍楼层（带阳台与夜晚温馨寝室灯贴图） */}
          <mesh position={[0, (h - 3.6) / 2 + 4.0, 0]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h - 3.6, d]} />
          </mesh>
          {/* 屋顶女儿墙压顶与双楼梯间 */}
          <mesh position={[0, h + 0.8, 0]} material={mats.parapet}>
            <boxGeometry args={[w + 1.4, 1.1, d + 1.4]} />
          </mesh>
          {[-w * 0.28, w * 0.28].map((rx) => (
            <mesh key={rx} position={[rx, h + 2.3, 0]} material={roofMat}>
              <boxGeometry args={[Math.min(10, w * 0.16), 2.2, d * 0.45]} />
            </mesh>
          ))}
        </>
      ) : isLab ? (
        // 工学馆 / 实验楼 / 理学馆 / 科技楼：现代科研基座 + 中央突显玻璃门厅核 + 屋顶设备间
        <>
          <mesh position={[0, 0.9, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 4, 1.8, d + 4]} />
          </mesh>
          <mesh position={[0, h / 2 + 1.6, 0]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          {/* 中央玻璃交通核/门厅 */}
          <mesh position={[0, h * 0.56 + 1.6, 0]} material={mats.glassAtrium} castShadow>
            <boxGeometry args={[Math.min(18, w * 0.22), h * 1.08, d + 3.2]} />
          </mesh>
          {/* 屋顶水平挑檐与科研设备间 */}
          <mesh position={[0, h + 2.0, 0]} material={mats.parapet}>
            <boxGeometry args={[w + 2.2, 1.2, d + 2.2]} />
          </mesh>
          <mesh position={[-w * 0.25, h + 3.6, 0]} material={roofMat}>
            <boxGeometry args={[w * 0.22, 2.2, d * 0.42]} />
          </mesh>
        </>
      ) : isCanteen ? (
        // 一饭 / 三饭 / 四饭：暖陶色悬挑大屋檐 + 明亮落地玻璃就餐大厅
        <>
          <mesh position={[0, 0.8, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 5, 1.6, d + 5]} />
          </mesh>
          <mesh position={[0, h / 2 + 1.5, 0]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          {/* 标志性悬挑大屋檐 */}
          <mesh position={[0, h + 2.0, 0]} castShadow>
            <boxGeometry args={[w + 4.5, 1.6, d + 4.5]} />
            <meshStandardMaterial
              color={selected ? '#ff9d73' : lighting.isDark ? '#8a5248' : '#eb8c64'}
              roughness={0.58}
            />
          </mesh>
          <mesh position={[0, h + 3.4, 0]} material={roofMat}>
            <boxGeometry args={[w * 0.56, 1.6, d * 0.52]} />
          </mesh>
        </>
      ) : (
        // 创谷 / 综合楼 / 文化中心 / 南亭村：精致台地 + 立面幕墙 + 顶层退台玻璃天窗
        <>
          <mesh position={[0, 0.8, 0]} material={mats.plinth} receiveShadow>
            <boxGeometry args={[w + 4, 1.6, d + 4]} />
          </mesh>
          <mesh position={[0, h / 2 + 1.5, 0]} material={boxMats} castShadow receiveShadow>
            <boxGeometry args={[w, h, d]} />
          </mesh>
          <mesh position={[0, h + 1.9, 0]} material={mats.parapet}>
            <boxGeometry args={[w + 2, 1.2, d + 2]} />
          </mesh>
          <mesh position={[0, h + 3.1, 0]} material={mats.glassAtrium}>
            <boxGeometry args={[w * 0.42, 1.6, d * 0.42]} />
          </mesh>
        </>
      )}

      {/* 选中高亮：按建筑真实轮廓贴合的暖橙发光底座（半圆/圆顶/矩形分别适配）+ 柔和悬浮定位标 */}
      {selected && (
        <>
          {building.shape === 'semicircle' ? (
            <mesh
              geometry={UNIT_SEMICIRCLE_GEO}
              position={[0, 0.35, d * 0.25]}
              scale={[Math.max(w, d) * 1.18, 0.9, Math.max(w, d) * 1.18]}
            >
              <meshBasicMaterial color="#ff7a4d" transparent opacity={0.58} />
            </mesh>
          ) : building.shape === 'dome' ? (
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[Math.max(w, d) * 0.63, Math.max(w, d) * 0.63, 0.9, 32]} />
              <meshBasicMaterial color="#ff7a4d" transparent opacity={0.58} />
            </mesh>
          ) : (
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[w + 10, 0.9, d + 10]} />
              <meshBasicMaterial color="#ff7a4d" transparent opacity={0.58} />
            </mesh>
          )}
          <SelectedPin height={h + 3} />
        </>
      )}
    </group>
  );
}

/** 3D 导航路线光带（自动拱过广工人行天桥）+ 流动方向光球 + 起终点立柱 */
function RouteOverlay3D({ route, lighting }: { route: CampusRoutePlan; lighting: CampusLightingPalette }) {
  const pulseRef = useRef<THREE.Group>(null);

  const { tubeGeo, startPt, endPt, curve } = useMemo(() => {
    const rawPts = route.waypoints.map((wp) => {
      const l = latLngToLocal(wp.lat, wp.lng);
      return new THREE.Vector3(l.x, 4.2, l.z);
    });
    const isNear = (p: THREE.Vector3, ref: { x: number; z: number }) => Math.hypot(p.x - ref.x, p.z - ref.z) < 8;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < rawPts.length; i++) {
      const cur = rawPts[i]!;
      pts.push(cur);
      const next = rawPts[i + 1];
      if (
        next &&
        ((isNear(cur, BRIDGE_NORTH_LOCAL) && isNear(next, BRIDGE_SOUTH_LOCAL)) ||
          (isNear(cur, BRIDGE_SOUTH_LOCAL) && isNear(next, BRIDGE_NORTH_LOCAL)))
      ) {
        pts.push(
          new THREE.Vector3(cur.x + (next.x - cur.x) * 0.2, 11.2, cur.z + (next.z - cur.z) * 0.2),
          new THREE.Vector3(cur.x + (next.x - cur.x) * 0.8, 11.2, cur.z + (next.z - cur.z) * 0.8),
        );
      }
    }
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) {
      path.add(new THREE.LineCurve3(pts[i - 1]!, pts[i]!));
    }
    const geo = pts.length >= 2 ? new THREE.TubeGeometry(path, Math.min(220, pts.length * 16), 3.4, 8, false) : null;
    return { tubeGeo: geo, startPt: pts[0]!, endPt: pts[pts.length - 1]!, curve: path };
  }, [route]);

  useEffect(() => {
    return () => {
      tubeGeo?.dispose();
    };
  }, [tubeGeo]);

  useFrame(({ clock }) => {
    if (!pulseRef.current || curve.curves.length === 0) return;
    const tBase = (clock.getElapsedTime() * 0.22) % 1;
    pulseRef.current.children.forEach((child, idx) => {
      const t = (tBase + idx / pulseRef.current!.children.length) % 1;
      const p = curve.getPointAt(t);
      child.position.set(p.x, p.y + 1.8, p.z);
    });
  });

  if (!tubeGeo) return null;

  return (
    <group>
      <mesh geometry={tubeGeo}>
        <meshStandardMaterial
          color={lighting.routeColor}
          emissive={lighting.routeGlowColor}
          emissiveIntensity={lighting.isDark ? 0.95 : 0.45}
          roughness={0.28}
        />
      </mesh>
      <group ref={pulseRef}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[4.4, 10, 10]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        ))}
      </group>
      <group position={[startPt.x, 0, startPt.z]}>
        <mesh position={[0, 18, 0]}>
          <sphereGeometry args={[7, 14, 14]} />
          <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={0.48} />
        </mesh>
        <mesh position={[0, 9, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 18, 8]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      </group>
      <group position={[endPt.x, 0, endPt.z]}>
        <mesh position={[0, 24, 0]}>
          <coneGeometry args={[9, 18, 16]} />
          <meshStandardMaterial color="#f97316" emissive="#fb923c" emissiveIntensity={0.58} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 2, 0]}>
          <ringGeometry args={[10, 15, 24]} />
          <meshBasicMaterial color="#fb923c" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/** 实时 GPS 蓝色脉冲定位点 + 精度圈 + 朝向扇形（带丝滑位置与方向插值） */
function UserLocationBeacon({ fix }: { fix: GeoFix }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const targetRef = useRef(latLngToLocal(fix.lat, fix.lng));
  const initializedRef = useRef(false);
  const accRadius = clamp(fix.accuracy, 10, 65);

  useEffect(() => {
    targetRef.current = latLngToLocal(fix.lat, fix.lng);
  }, [fix.lat, fix.lng]);

  useFrame(({ clock }, delta) => {
    if (groupRef.current) {
      const t = targetRef.current;
      if (!initializedRef.current) {
        groupRef.current.position.set(t.x, 1.8, t.z);
        initializedRef.current = true;
      } else {
        const k = 1 - Math.exp(-Math.min(delta, 0.05) * 10);
        groupRef.current.position.x += (t.x - groupRef.current.position.x) * k;
        groupRef.current.position.z += (t.z - groupRef.current.position.z) * k;
      }
    }
    if (!ringRef.current) return;
    const s = 1 + ((clock.getElapsedTime() * 0.7) % 1) * 1.4;
    ringRef.current.scale.set(s, s, 1);
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 0.55 * (1 - ((clock.getElapsedTime() * 0.7) % 1)));
  });

  const [initialPos] = useState(() => latLngToLocal(fix.lat, fix.lng));

  return (
    <group ref={groupRef} position={[initialPos.x, 1.8, initialPos.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[accRadius, 32]} />
        <meshBasicMaterial color="#3b82f6" transparent opacity={0.18} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <ringGeometry args={[8, 12, 24]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {fix.heading !== null && (
        <group rotation={[0, (-fix.heading * Math.PI) / 180, 0]}>
          <mesh position={[0, 1.4, -18]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[8.5, 22, 3]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={0.5} />
          </mesh>
        </group>
      )}
      <mesh position={[0, 3.2, 0]}>
        <sphereGeometry args={[7.5, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 4.2, 0]}>
        <sphereGeometry args={[5.8, 16, 16]} />
        <meshBasicMaterial color="#2563eb" />
      </mesh>
    </group>
  );
}

/** 相机控制器 + 零重渲染 2D 标签投影与屏幕安全区碰撞避让 */
function CameraAndLabelsRig({
  stateRef,
  view3d,
  cameraTarget,
  controlApiRef,
  labelElsRef,
  wmElsRef,
  selectedId,
  routeEndId,
  category,
  onYawChange,
}: {
  stateRef: MutableRefObject<CameraState>;
  view3d: boolean;
  cameraTarget: CameraTarget | null;
  controlApiRef: MutableRefObject<CameraControlApi | null>;
  labelElsRef: MutableRefObject<Map<string, HTMLButtonElement>>;
  wmElsRef: MutableRefObject<Map<string, HTMLSpanElement>>;
  selectedId: string | null;
  routeEndId: string | null;
  category: BuildingCategory;
  onYawChange?: (yawRad: number) => void;
}) {
  const { camera, size } = useThree();
  const lastSeqRef = useRef(-1);
  const lastYawReported = useRef(0);
  const projVec = useMemo(() => new THREE.Vector3(), []);
  const orderedBuildings = useMemo(
    () =>
      [...GDUT_HEMC_BUILDINGS].sort((a, b) => {
        const aSpec = a.id === selectedId || a.id === routeEndId ? 0 : 1;
        const bSpec = b.id === selectedId || b.id === routeEndId ? 0 : 1;
        if (aSpec !== bSpec) return aSpec - bSpec;
        return a.priority - b.priority;
      }),
    [routeEndId, selectedId],
  );

  useEffect(() => {
    controlApiRef.current = {
      resetNorth: () => {
        stateRef.current.goalYaw = 0;
      },
      zoomBy: (factor: number) => {
        stateRef.current.goalDistance = clamp(stateRef.current.goalDistance * factor, MIN_DIST, MAX_DIST);
      },
    };
  }, [controlApiRef, stateRef]);

  useEffect(() => {
    if (!cameraTarget || cameraTarget.seq === lastSeqRef.current) return;
    lastSeqRef.current = cameraTarget.seq;
    stateRef.current.goalX = clamp(cameraTarget.x, CLAMP_X[0], CLAMP_X[1]);
    stateRef.current.goalZ = clamp(cameraTarget.z, CLAMP_Z[0], CLAMP_Z[1]);
    if (cameraTarget.distance !== undefined) {
      stateRef.current.goalDistance = clamp(cameraTarget.distance, MIN_DIST, MAX_DIST);
    }
  }, [cameraTarget, stateRef]);

  useFrame((_, delta) => {
    const st = stateRef.current;
    const dt = Math.min(delta, 0.05);
    const k = 1 - Math.exp(-dt * 10);

    st.x += (st.goalX - st.x) * k;
    st.z += (st.goalZ - st.z) * k;
    st.distance += (st.goalDistance - st.distance) * k;
    st.yaw += (st.goalYaw - st.yaw) * k;
    const targetPitch = view3d ? 0.8 : 1.5;
    st.pitch += (targetPitch - st.pitch) * k;

    const horiz = Math.cos(st.pitch) * st.distance;
    const height = Math.sin(st.pitch) * st.distance;
    camera.position.set(st.x + Math.sin(st.yaw) * horiz, height, st.z + Math.cos(st.yaw) * horiz);
    camera.lookAt(st.x, 0, st.z);
    camera.updateMatrixWorld();

    if (onYawChange && Math.abs(st.yaw - lastYawReported.current) > 0.04) {
      lastYawReported.current = st.yaw;
      onYawChange(st.yaw);
    }

    const maxPrio = st.distance > 1180 ? 1 : st.distance > 620 ? 2 : 3;
    const safeLeft = 18;
    const safeRight = size.width - 74;
    const safeTop = 118;
    const safeBottom = size.height - 132;
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    const collides = (l: number, r: number, t: number, b: number) =>
      placed.some((p) => !(r < p.l || l > p.r || b < p.t || t > p.b));

    for (const b of orderedBuildings) {
      const el = labelElsRef.current.get(b.id);
      if (!el) continue;
      const isSpecial = b.id === selectedId || b.id === routeEndId;
      const matchesCat = category === 'all' || b.category === category;
      const shouldShow =
        isSpecial ||
        (matchesCat && (category !== 'all' ? b.priority <= 3 && st.distance < 1500 : b.priority <= maxPrio));
      if (!shouldShow) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }
      const p = BUILDING_LOCAL.get(b.id)!;
      projVec.set(p.x, b.height + 10, p.z).project(camera);
      if (projVec.z > 1 || projVec.z < -1 || Math.abs(projVec.x) > 1.02 || Math.abs(projVec.y) > 1.02) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }
      const sx = (projVec.x * 0.5 + 0.5) * size.width;
      const sy = (-projVec.y * 0.5 + 0.5) * size.height;
      const estW = Math.max(36, b.shortName.length * 11 + 18);
      const estH = 22;
      const l = sx - estW / 2 - 4;
      const r = sx + estW / 2 + 4;
      const t = sy - estH - 4;
      const bt = sy + 2;

      if (
        !isSpecial &&
        (l < safeLeft || r > safeRight || t < safeTop || bt > safeBottom || collides(l, r, t, bt))
      ) {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        continue;
      }
      placed.push({ l, r, t, b: bt });
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
    }

    const showWm = st.distance > 920;
    for (const wm of ZONE_WATERMARKS) {
      const el = wmElsRef.current.get(wm.id);
      if (!el) continue;
      if (!showWm) {
        el.style.opacity = '0';
        continue;
      }
      const p = wm.local;
      projVec.set(p.x, 3, p.z).project(camera);
      if (projVec.z > 1 || projVec.z < -1) {
        el.style.opacity = '0';
        continue;
      }
      const sx = (projVec.x * 0.5 + 0.5) * size.width;
      const sy = (-projVec.y * 0.5 + 0.5) * size.height;
      const estW = wm.label.length * 11 + 22;
      const l = sx - estW / 2 - 4;
      const r = sx + estW / 2 + 4;
      const t = sy - 13;
      const bt = sy + 13;
      if (l < safeLeft || r > safeRight || t < safeTop || bt > safeBottom || collides(l, r, t, bt)) {
        el.style.opacity = '0';
        continue;
      }
      placed.push({ l, r, t, b: bt });
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = '0.82';
    }
  });

  return null;
}

/** 场景内部主体：管理纹理与共享建筑材质生命周期 */
function CampusWorldContent({
  lighting,
  category,
  selectedId,
  route,
  routeEndId,
  userFix,
  userInsideCampus,
  onSelectBuilding,
}: {
  lighting: CampusLightingPalette;
  category: BuildingCategory;
  selectedId: string | null;
  route: CampusRoutePlan | null;
  routeEndId: string | null;
  userFix: GeoFix | null;
  userInsideCampus: boolean;
  onSelectBuilding: (b: CampusBuilding) => void;
}) {
  const textures = useMemo(() => createCampusTextureSet(lighting.isDark), [lighting.isDark]);
  useEffect(() => {
    return () => textures.dispose();
  }, [textures]);

  const mats = useMemo(() => createBuildingMaterials(lighting, textures), [lighting, textures]);
  useEffect(() => {
    return () => mats.dispose();
  }, [mats]);

  return (
    <>
      {/* 建筑级三点布光：主日光/月光 + 柔和天空半球光 + 对向冷/暖轮廓补光 */}
      <ambientLight color={lighting.ambientColor} intensity={lighting.ambientIntensity * 0.88} />
      <hemisphereLight args={[lighting.hemiSky, lighting.hemiGround, lighting.hemiIntensity]} />
      <directionalLight
        position={lighting.sunPos}
        color={lighting.sunColor}
        intensity={lighting.sunIntensity}
        castShadow
        shadow-mapSize-width={1536}
        shadow-mapSize-height={1536}
        shadow-bias={-0.0004}
        shadow-normalBias={1.2}
        shadow-camera-left={-1150}
        shadow-camera-right={1150}
        shadow-camera-top={920}
        shadow-camera-bottom={-920}
        shadow-camera-near={100}
        shadow-camera-far={2500}
      />
      <directionalLight
        position={[-lighting.sunPos[0] * 0.7, 320, -lighting.sunPos[2] * 0.7]}
        color={lighting.isDark ? '#6388c9' : '#c7e0ff'}
        intensity={lighting.isDark ? 0.32 : 0.38}
      />

      <CampusFeatures lighting={lighting} textures={textures} />
      <CampusRoads lighting={lighting} />

      <group>
        {GDUT_HEMC_BUILDINGS.map((b) => (
          <BuildingMesh
            key={b.id}
            building={b}
            lighting={lighting}
            mats={mats}
            selected={b.id === selectedId || b.id === routeEndId}
            dimmed={category !== 'all' && b.category !== category}
            onSelect={onSelectBuilding}
          />
        ))}
      </group>

      {route && <RouteOverlay3D route={route} lighting={lighting} />}
      {userFix && userInsideCampus && <UserLocationBeacon fix={userFix} />}
    </>
  );
}

export function CampusScene3D({
  lighting,
  view3d,
  category,
  selectedId,
  route,
  routeEndId,
  userFix,
  userInsideCampus,
  cameraTarget,
  controlApiRef,
  onSelectBuilding,
  onYawChange,
}: CampusScene3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const wmElsRef = useRef<Map<string, HTMLSpanElement>>(new Map());
  const stateRef = useRef<CameraState>({
    x: -40,
    z: 60,
    distance: 1020,
    pitch: view3d ? 0.8 : 1.5,
    yaw: 0,
    goalX: -40,
    goalZ: 60,
    goalDistance: 1020,
    goalYaw: 0,
    dragging: false,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let prevCenter: { x: number; y: number } | null = null;
    let prevPinchDist = 0;
    let prevPinchAngle = 0;
    let rotateMouse = false;

    const onPointerDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button[data-map-label]')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      rotateMouse = e.button === 2 || e.shiftKey;
      stateRef.current.dragging = true;
      if (pointers.size === 1) {
        prevCenter = { x: e.clientX, y: e.clientY };
      } else if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        prevCenter = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        prevPinchDist = Math.hypot(b!.x - a!.x, b!.y - a!.y);
        prevPinchAngle = Math.atan2(b!.y - a!.y, b!.x - a!.x);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const st = stateRef.current;

      if (pointers.size === 1 && prevCenter) {
        const dx = e.clientX - prevCenter.x;
        const dy = e.clientY - prevCenter.y;
        prevCenter = { x: e.clientX, y: e.clientY };
        if (rotateMouse) {
          st.goalYaw -= dx * 0.007;
          return;
        }
        const scale = st.distance * 0.00145;
        const cosY = Math.cos(st.yaw);
        const sinY = Math.sin(st.yaw);
        const moveX = (-dx * cosY - dy * sinY) * scale;
        const moveZ = (dx * sinY - dy * cosY) * scale;
        st.goalX = clamp(st.goalX + moveX, CLAMP_X[0], CLAMP_X[1]);
        st.goalZ = clamp(st.goalZ + moveZ, CLAMP_Z[0], CLAMP_Z[1]);
      } else if (pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const center = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        const dist = Math.hypot(b!.x - a!.x, b!.y - a!.y);
        const angle = Math.atan2(b!.y - a!.y, b!.x - a!.x);

        if (prevPinchDist > 10 && dist > 10) {
          st.goalDistance = clamp(st.goalDistance * (prevPinchDist / dist), MIN_DIST, MAX_DIST);
        }
        let dAngle = angle - prevPinchAngle;
        if (dAngle > Math.PI) dAngle -= Math.PI * 2;
        if (dAngle < -Math.PI) dAngle += Math.PI * 2;
        st.goalYaw -= dAngle * 0.85;

        if (prevCenter) {
          const dx = center.x - prevCenter.x;
          const dy = center.y - prevCenter.y;
          const scale = st.distance * 0.0013;
          const cosY = Math.cos(st.yaw);
          const sinY = Math.sin(st.yaw);
          st.goalX = clamp(st.goalX + (-dx * cosY - dy * sinY) * scale, CLAMP_X[0], CLAMP_X[1]);
          st.goalZ = clamp(st.goalZ + (dx * sinY - dy * cosY) * scale, CLAMP_Z[0], CLAMP_Z[1]);
        }

        prevCenter = center;
        prevPinchDist = dist;
        prevPinchAngle = angle;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        prevCenter = null;
        stateRef.current.dragging = false;
      } else if (pointers.size === 1) {
        const [only] = Array.from(pointers.values());
        prevCenter = { x: only!.x, y: only!.y };
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      stateRef.current.goalDistance = clamp(stateRef.current.goalDistance * factor, MIN_DIST, MAX_DIST);
    };

    const onContext = (e: MouseEvent) => e.preventDefault();

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onContext);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContext);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{ background: lighting.skyBg }}
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ fov: 42, near: 10, far: 4800, position: [-40, 760, 720] }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
      >
        <color attach="background" args={[lighting.skyBg]} />
        <fog attach="fog" args={[lighting.fogColor, 1650, 3600]} />

        <CampusWorldContent
          lighting={lighting}
          category={category}
          selectedId={selectedId}
          route={route}
          routeEndId={routeEndId}
          userFix={userFix}
          userInsideCampus={userInsideCampus}
          onSelectBuilding={onSelectBuilding}
        />

        <CameraAndLabelsRig
          stateRef={stateRef}
          view3d={view3d}
          cameraTarget={cameraTarget}
          controlApiRef={controlApiRef}
          labelElsRef={labelElsRef}
          wmElsRef={wmElsRef}
          selectedId={selectedId}
          routeEndId={routeEndId}
          category={category}
          onYawChange={onYawChange}
        />
      </Canvas>

      {/* 远景片区水印层 */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {ZONE_WATERMARKS.map((wm) => (
          <span
            key={wm.id}
            ref={(el) => {
              if (el) wmElsRef.current.set(wm.id, el);
              else wmElsRef.current.delete(wm.id);
            }}
            className={`absolute left-0 top-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-opacity duration-200 ${
              lighting.isDark
                ? 'bg-slate-950/65 text-sky-200/90 ring-1 ring-white/10'
                : 'bg-white/78 text-slate-700 ring-1 ring-slate-900/10'
            }`}
            style={{ opacity: 0 }}
          >
            {wm.label}
          </span>
        ))}
      </div>

      {/* 高清 2D 建筑浮动标签层（直接通过 ref 跟随 3D 坐标，零 React 重渲染） */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {GDUT_HEMC_BUILDINGS.map((b) => {
          const active = b.id === selectedId || b.id === routeEndId;
          return (
            <button
              key={b.id}
              type="button"
              data-map-label="1"
              ref={(el) => {
                if (el) labelElsRef.current.set(b.id, el);
                else labelElsRef.current.delete(b.id);
              }}
              onClick={() => onSelectBuilding(b)}
              style={{ opacity: 0 }}
              className={`absolute left-0 top-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm transition-colors ${
                active
                  ? 'z-20 bg-orange-500 text-white ring-2 ring-white/80'
                  : lighting.isDark
                    ? 'z-10 bg-slate-900/84 text-slate-100 ring-1 ring-white/15 hover:bg-slate-800'
                    : 'z-10 bg-white/90 text-slate-800 ring-1 ring-slate-900/10 hover:bg-white'
              }`}
            >
              {b.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
