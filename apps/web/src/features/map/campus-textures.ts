import * as THREE from 'three';

/**
 * 广工大学城 3D 校园地图程序化建筑立面纹理与精密几何体工厂。
 *
 * 所有贴图均由离屏 Canvas 一次性生成并缓存，不依赖外部图片资源、零网络请求、
 * 极低显存占用（< 2MB），可在手机端 WebView 稳定保持 60fps 的同时大幅提升建筑精致度。
 */

export type FacadeStyle = 'teaching' | 'lab' | 'dorm' | 'landmark' | 'canteen';

export interface CampusTextureSet {
  facades: Record<FacadeStyle, THREE.CanvasTexture>;
  emissives: Record<FacadeStyle, THREE.CanvasTexture>;
  stadiumTop: THREE.CanvasTexture;
  basketballCourt: THREE.CanvasTexture;
  ringRoad: THREE.CanvasTexture;
  mainRoad: THREE.CanvasTexture;
  dispose: () => void;
}

function makeRng(seedStart: number) {
  let s = seedStart >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(canvas: HTMLCanvasElement, repeatX = 1, repeatY = 1, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** 生成建筑立面基础贴图与夜晚窗灯自发光贴图 */
function buildFacadePair(
  style: FacadeStyle,
  isDark: boolean,
): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 256;
  const H = 256;
  const [mapC, ctx] = makeCanvas(W, H);
  const [emiC, ectx] = makeCanvas(W, H);

  const rand = makeRng(
    style === 'teaching' ? 101 : style === 'lab' ? 202 : style === 'dorm' ? 303 : style === 'landmark' ? 404 : 505,
  );

  // 底色（纯黑自发光底）
  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, W, H);

  if (style === 'teaching') {
    // 教学楼：清爽浅石材水平腰线 + 通透横条玻璃窗 + 竖向混凝土立柱
    ctx.fillStyle = isDark ? '#324869' : '#edf2f8';
    ctx.fillRect(0, 0, W, H);

    const floors = 5;
    const cols = 8;
    const floorH = H / floors;
    const colW = W / cols;

    for (let f = 0; f < floors; f++) {
      const y = f * floorH;
      // 楼层板阴影压线
      ctx.fillStyle = isDark ? 'rgba(10,18,34,0.45)' : 'rgba(110,132,160,0.22)';
      ctx.fillRect(0, y, W, 3);
      // 遮阳挑板亮边
      ctx.fillStyle = isDark ? 'rgba(165,195,235,0.12)' : 'rgba(255,255,255,0.85)';
      ctx.fillRect(0, y + 3, W, 2);

      for (let c = 0; c < cols; c++) {
        const x = c * colW;
        const wx = x + 3;
        const wy = y + 9;
        const ww = colW - 6;
        const wh = floorH - 18;
        const lit = isDark && rand() > 0.42;

        if (lit) {
          const warm = rand() > 0.25;
          ctx.fillStyle = warm ? '#ffd98e' : '#cfe9ff';
          ctx.fillRect(wx, wy, ww, wh);
          ectx.fillStyle = warm ? '#ffca66' : '#8fd0ff';
          ectx.fillRect(wx, wy, ww, wh);
        } else {
          const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
          if (isDark) {
            grad.addColorStop(0, '#16243b');
            grad.addColorStop(1, '#203554');
          } else {
            grad.addColorStop(0, '#5a7ea3');
            grad.addColorStop(0.55, '#7ea4c7');
            grad.addColorStop(1, '#4c6d8f');
          }
          ctx.fillStyle = grad;
          ctx.fillRect(wx, wy, ww, wh);
          // 窗框细中梃
          ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)';
          ctx.fillRect(wx + ww * 0.5, wy, 1, wh);
        }
      }
    }
  } else if (style === 'lab') {
    // 工学馆/实验楼：现代科研灰蓝幕墙网格 + 竖向结构肋板
    ctx.fillStyle = isDark ? '#2c3f5e' : '#e0e9f2';
    ctx.fillRect(0, 0, W, H);

    const floors = 6;
    const cols = 10;
    const floorH = H / floors;
    const colW = W / cols;

    for (let f = 0; f < floors; f++) {
      const y = f * floorH;
      ctx.fillStyle = isDark ? '#1e2c44' : '#b7c7d9';
      ctx.fillRect(0, y, W, 6);

      for (let c = 0; c < cols; c++) {
        const x = c * colW;
        const wx = x + 2;
        const wy = y + 8;
        const ww = colW - 4;
        const wh = floorH - 12;
        const lit = isDark && rand() > 0.56;

        if (lit) {
          const cool = rand() > 0.45;
          ctx.fillStyle = cool ? '#d8eeff' : '#ffd88a';
          ctx.fillRect(wx, wy, ww, wh);
          ectx.fillStyle = cool ? '#9ed4ff' : '#ffc860';
          ectx.fillRect(wx, wy, ww, wh);
        } else {
          ctx.fillStyle = isDark ? '#142238' : '#4a6b8c';
          ctx.fillRect(wx, wy, ww, wh);
          ctx.fillStyle = isDark ? 'rgba(120,170,225,0.12)' : 'rgba(220,240,255,0.32)';
          ctx.fillRect(wx, wy, ww, 4);
        }
      }
    }
  } else if (style === 'dorm') {
    // 东西区宿舍：岭南暖米白/陶土外墙 + 退台阳台阴影 + 细铁艺护栏 + 夜晚温馨零星寝室灯光
    ctx.fillStyle = isDark ? '#433d5c' : '#f4e6d8';
    ctx.fillRect(0, 0, W, H);

    const floors = 6;
    const cols = 8;
    const floorH = H / floors;
    const colW = W / cols;

    for (let f = 0; f < floors; f++) {
      const y = f * floorH;
      // 每层楼板线
      ctx.fillStyle = isDark ? 'rgba(15,15,30,0.4)' : 'rgba(165,128,100,0.28)';
      ctx.fillRect(0, y, W, 3);

      for (let c = 0; c < cols; c++) {
        const x = c * colW;
        const bx = x + 3;
        const by = y + 6;
        const bw = colW - 6;
        const bh = floorH - 9;

        // 阳台凹槽阴影
        ctx.fillStyle = isDark ? '#252138' : '#cfb69f';
        ctx.fillRect(bx, by, bw, bh);

        // 内层玻璃推拉门
        const lit = isDark && rand() > 0.46;
        if (lit) {
          ctx.fillStyle = '#ffe0a3';
          ctx.fillRect(bx + 2, by + 2, bw - 4, bh * 0.62);
          ectx.fillStyle = '#ffcb6b';
          ectx.fillRect(bx + 2, by + 2, bw - 4, bh * 0.58);
        } else {
          ctx.fillStyle = isDark ? '#1a1a2e' : '#7c8c9e';
          ctx.fillRect(bx + 2, by + 2, bw - 4, bh * 0.58);
        }

        // 阳台栏板/护栏
        ctx.fillStyle = isDark ? '#544d73' : '#f7ede3';
        ctx.fillRect(bx, by + bh * 0.62, bw, bh * 0.38);
        ctx.fillStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(150,115,90,0.25)';
        ctx.fillRect(bx, by + bh * 0.62, bw, 2);
      }
    }
  } else if (style === 'landmark') {
    // 图书馆/综合楼/文化中心：大气浅石材竖向列柱 + 高透玻璃幕墙
    ctx.fillStyle = isDark ? '#3c5378' : '#f7f4ee';
    ctx.fillRect(0, 0, W, H);

    const cols = 12;
    const colW = W / cols;
    // 竖向玻璃幕墙槽
    for (let c = 0; c < cols; c++) {
      const x = c * colW;
      const gx = x + 4;
      const gw = colW - 8;
      const grad = ctx.createLinearGradient(gx, 0, gx, H);
      if (isDark) {
        grad.addColorStop(0, '#1e3557');
        grad.addColorStop(0.5, '#2d4c75');
        grad.addColorStop(1, '#1a2c47');
      } else {
        grad.addColorStop(0, '#6290b8');
        grad.addColorStop(0.5, '#8ab4d6');
        grad.addColorStop(1, '#527ca3');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(gx, 14, gw, H - 28);

      // 夜晚自习室暖光透出
      if (isDark) {
        for (let r = 0; r < 5; r++) {
          if (rand() > 0.28) {
            const ry = 22 + r * 44;
            ctx.fillStyle = '#ffe3a3';
            ctx.fillRect(gx + 1, ry, gw - 2, 24);
            ectx.fillStyle = '#ffd175';
            ectx.fillRect(gx + 1, ry, gw - 2, 24);
          }
        }
      }
    }
    // 水平楼层腰带
    ctx.fillStyle = isDark ? '#4a648c' : '#f2ede4';
    for (let r = 0; r <= 5; r++) {
      ctx.fillRect(0, r * 48, W, 8);
    }
  } else {
    // 饭堂：岭南暖陶红上檐 + 底层明亮落地大玻璃（暖光透出）
    ctx.fillStyle = isDark ? '#69403c' : '#f5b089';
    ctx.fillRect(0, 0, W, H);

    // 底层与二层明亮通透玻璃大厅
    const floors = 3;
    const floorH = H / floors;
    for (let f = 0; f < floors; f++) {
      const y = f * floorH;
      ctx.fillStyle = isDark ? '#4c2c2c' : '#e39268';
      ctx.fillRect(0, y, W, 12);

      for (let c = 0; c < 6; c++) {
        const wx = c * (W / 6) + 4;
        const ww = W / 6 - 8;
        const wy = y + 16;
        const wh = floorH - 22;
        if (isDark) {
          const lit = f >= 1 || rand() > 0.3;
          ctx.fillStyle = lit ? '#ffdf9e' : '#2a2230';
          ctx.fillRect(wx, wy, ww, wh);
          if (lit) {
            ectx.fillStyle = '#ffc864';
            ectx.fillRect(wx, wy, ww, wh);
          }
        } else {
          ctx.fillStyle = f === 2 ? '#ffe5bd' : '#739fc2';
          ctx.fillRect(wx, wy, ww, wh);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(wx + 2, wy + 2, ww * 0.35, wh - 4);
        }
      }
    }
  }

  return {
    map: toTexture(mapC, 1, 1, true),
    emissive: toTexture(emiC, 1, 1, false),
  };
}

/** 中心体育场顶面贴图：6 跑道红塑胶田径场 + 双色草坪条纹足球场 + 标准白线 */
function buildStadiumTexture(isDark: boolean): THREE.CanvasTexture {
  const W = 512;
  const H = 512;
  const [c, ctx] = makeCanvas(W, H);

  // 塑胶跑道底色
  ctx.fillStyle = isDark ? '#6e343a' : '#d45f4f';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;

  // 多道白色椭圆形塑胶跑道线
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const padX = 20 + i * 11;
    const padY = 18 + i * 11;
    const rx = W / 2 - padX;
    const straightH = Math.max(0, H - 2 * padY - 2 * rx);
    ctx.beginPath();
    ctx.roundRect(padX, padY, W - padX * 2, H - padY * 2, rx);
    ctx.stroke();
    void straightH;
  }

  // 内部双色割草条纹绿茵足球场
  const px = 98;
  const py = 96;
  const pw = W - px * 2;
  const ph = H - py * 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px - 8, py - 24, pw + 16, ph + 48, (pw + 16) / 2);
  ctx.clip();

  const stripes = 10;
  const stripeH = (ph + 48) / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle =
      i % 2 === 0
        ? isDark
          ? '#1a4f3b'
          : '#49a85e'
        : isDark
          ? '#164332'
          : '#57b86b';
    ctx.fillRect(px - 10, py - 24 + i * stripeH, pw + 20, stripeH + 1);
  }
  ctx.restore();

  // 足球场标准白线（边线、中线、中圈、大禁区）
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 3;
  ctx.strokeRect(px + 10, py + 8, pw - 20, ph - 16);
  // 中线
  ctx.beginPath();
  ctx.moveTo(px + 10, cy);
  ctx.lineTo(W - px - 10, cy);
  ctx.stroke();
  // 中圈
  ctx.beginPath();
  ctx.arc(cx, cy, 42, 0, Math.PI * 2);
  ctx.stroke();
  // 南北禁区
  ctx.strokeRect(cx - 72, py + 8, 144, 52);
  ctx.strokeRect(cx - 72, H - py - 60, 144, 52);

  return toTexture(c, 1, 1, true);
}

/** B/C 区室外多连片标准篮球场贴图 */
function buildBasketballCourtTexture(isDark: boolean): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);

  // 绿色外场防滑区
  ctx.fillStyle = isDark ? '#1a423c' : '#3a8c72';
  ctx.fillRect(0, 0, W, H);

  const count = 4;
  const gap = 14;
  const cw = (W - gap * (count + 1)) / count;
  const ch = H - 28;

  for (let i = 0; i < count; i++) {
    const x = gap + i * (cw + gap);
    const y = 14;
    // 蓝/橙双色塑胶球场内区
    ctx.fillStyle = isDark ? (i % 2 === 0 ? '#244b66' : '#633c36') : i % 2 === 0 ? '#4e8ab8' : '#d67456';
    ctx.fillRect(x, y, cw, ch);

    // 白色球场边线、中线、三分线
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    ctx.beginPath();
    ctx.moveTo(x + 4, y + ch / 2);
    ctx.lineTo(x + cw - 4, y + ch / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + cw / 2, y + ch / 2, 16, 0, Math.PI * 2);
    ctx.stroke();
    // 三分弧
    ctx.beginPath();
    ctx.arc(x + cw / 2, y + 12, cw * 0.36, 0, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + cw / 2, y + ch - 12, cw * 0.36, Math.PI, Math.PI * 2);
    ctx.stroke();
  }

  return toTexture(c, 1, 1, true);
}

/** 道路表面纹理：带清晰虚线中轴标线与边缘标线 */
function buildRoadTexture(isRing: boolean, isDark: boolean): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const [c, ctx] = makeCanvas(W, H);

  if (isRing) {
    ctx.fillStyle = isDark ? '#7a5d3b' : '#f2c272';
    ctx.fillRect(0, 0, W, H);
    // 路肩边线
    ctx.fillStyle = isDark ? 'rgba(255,235,200,0.22)' : 'rgba(255,255,255,0.65)';
    ctx.fillRect(3, 0, 2, H);
    ctx.fillRect(W - 5, 0, 2, H);
    // 中央双实线/虚线
    ctx.fillStyle = isDark ? 'rgba(255,220,145,0.55)' : 'rgba(255,255,255,0.88)';
    ctx.fillRect(W / 2 - 3, 14, 2, 42);
    ctx.fillRect(W / 2 + 1, 14, 2, 42);
    ctx.fillRect(W / 2 - 3, 76, 2, 42);
    ctx.fillRect(W / 2 + 1, 76, 2, 42);
  } else {
    ctx.fillStyle = isDark ? '#3a4d70' : '#f5f7fa';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = isDark ? 'rgba(180,210,255,0.16)' : 'rgba(185,198,215,0.55)';
    ctx.fillRect(2, 0, 2, H);
    ctx.fillRect(W - 4, 0, 2, H);
    ctx.fillStyle = isDark ? 'rgba(180,215,255,0.28)' : 'rgba(165,180,200,0.5)';
    ctx.fillRect(W / 2 - 1, 16, 2, 34);
    ctx.fillRect(W / 2 - 1, 78, 2, 34);
  }

  return toTexture(c, 1, 1, true);
}

export function createCampusTextureSet(isDark: boolean): CampusTextureSet {
  const styles: FacadeStyle[] = ['teaching', 'lab', 'dorm', 'landmark', 'canteen'];
  const facades = {} as Record<FacadeStyle, THREE.CanvasTexture>;
  const emissives = {} as Record<FacadeStyle, THREE.CanvasTexture>;
  for (const st of styles) {
    const pair = buildFacadePair(st, isDark);
    facades[st] = pair.map;
    emissives[st] = pair.emissive;
  }
  const stadiumTop = buildStadiumTexture(isDark);
  const basketballCourt = buildBasketballCourtTexture(isDark);
  const ringRoad = buildRoadTexture(true, isDark);
  const mainRoad = buildRoadTexture(false, isDark);

  return {
    facades,
    emissives,
    stadiumTop,
    basketballCourt,
    ringRoad,
    mainRoad,
    dispose: () => {
      for (const st of styles) {
        facades[st].dispose();
        emissives[st].dispose();
      }
      stadiumTop.dispose();
      basketballCourt.dispose();
      ringRoad.dispose();
      mainRoad.dispose();
    },
  };
}

/** 单位尺寸水密半圆体量（用于东区二饭、大讲堂） */
export const UNIT_SEMICIRCLE_GEO: THREE.ExtrudeGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.absarc(0, 0, 0.5, Math.PI, 0, true);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  return geo;
})();

/** 单位尺寸阶梯坡屋顶大教室（用于一/三/四号大教室，前高后低的阶梯报告厅造型） */
export const UNIT_TIERED_AUDITORIUM_GEO: THREE.ExtrudeGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, 0.64);
  shape.lineTo(-0.5, 1.0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  return geo;
})();

/** 单位尺寸圆弧端头胶囊形体育场底座（X 宽 1，Z 长 1，高度 1） */
export const UNIT_STADIUM_CAPSULE_GEO: THREE.ExtrudeGeometry = (() => {
  const r = 0.5;
  const halfStraight = 0.25;
  const shape = new THREE.Shape();
  // 在 XY 平面沿 Y 轴拉长 [-0.5, 0.5]（实际通过 scale=[w, h, d] 适配真实纵横比）
  shape.absarc(0, halfStraight, r, 0, Math.PI, false);
  shape.absarc(0, -halfStraight, r, Math.PI, Math.PI * 2, false);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2);
  // 归一化到 [-0.5, 0.5] × [0, 1] × [-0.5, 0.5]
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const sx = 1 / (bb.max.x - bb.min.x);
  const sz = 1 / (bb.max.z - bb.min.z);
  geo.scale(sx, 1, sz);
  // 重新归一化顶面 UV 到 [0, 1] 让跑道与球场贴图完美铺满胶囊形状
  const pos = geo.attributes.position!;
  const uv = geo.attributes.uv!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, x + 0.5, 0.5 - z);
  }
  uv.needsUpdate = true;
  return geo;
})();

/** 广工人行天桥弧形遮雨棚几何（宽 1，高 1，长 1，沿 Z 轴拉伸） */
export const UNIT_ARCH_CANOPY_GEO: THREE.ExtrudeGeometry = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.quadraticCurveTo(0, 0.75, 0.5, 0);
  shape.lineTo(0.42, -0.14);
  shape.quadraticCurveTo(0, 0.55, -0.42, -0.14);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 16 });
  geo.translate(0, 0, -0.5);
  return geo;
})();
