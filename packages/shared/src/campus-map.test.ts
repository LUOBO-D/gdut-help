import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  distanceToRouteMeters,
  findNearestBuilding,
  GDUT_HEMC_BUILDINGS,
  GDUT_HEMC_ROAD_EDGES,
  GDUT_HEMC_ROAD_NODES,
  getCampusBuilding,
  isInsideCampusBounds,
  latLngToLocal,
  localToLatLng,
  matchCampusBuilding,
  planCampusRoute,
} from './campus-map.js';

describe('GDUT HEMC campus map data & A* router', () => {
  it('all buildings and road edges reference valid road nodes', () => {
    const nodeIds = new Set(GDUT_HEMC_ROAD_NODES.map((n) => n.id));
    for (const b of GDUT_HEMC_BUILDINGS) {
      expect(nodeIds.has(b.roadNodeId), `${b.id} -> ${b.roadNodeId}`).toBe(true);
      expect(isInsideCampusBounds(b.lat, b.lng), `${b.id} inside bounds`).toBe(true);
    }
    for (const e of GDUT_HEMC_ROAD_EDGES) {
      expect(nodeIds.has(e.from), `edge from ${e.from}`).toBe(true);
      expect(nodeIds.has(e.to), `edge to ${e.to}`).toBe(true);
    }
  });

  it('has zero overlapping 3D building footprints after OSM WGS-84 calibration', () => {
    for (let i = 0; i < GDUT_HEMC_BUILDINGS.length; i++) {
      const a = GDUT_HEMC_BUILDINGS[i]!;
      const pa = latLngToLocal(a.lat, a.lng);
      for (let j = i + 1; j < GDUT_HEMC_BUILDINGS.length; j++) {
        const b = GDUT_HEMC_BUILDINGS[j]!;
        const pb = latLngToLocal(b.lat, b.lng);
        const overlapX = (a.width + b.width) / 2 - Math.abs(pa.x - pb.x);
        const overlapZ = (a.depth + b.depth) / 2 - Math.abs(pa.z - pb.z);
        expect(overlapX > 0 && overlapZ > 0, `overlap between ${a.id} and ${b.id}`).toBe(false);
      }
    }
  });

  it('aligns key landmarks within 15m of real OpenStreetMap WGS-84 GPS coordinates', () => {
    const anchors: [string, number, number][] = [
      ['library', 23.040127, 113.389745],
      ['jiao3', 23.041462, 113.390433],
      ['gym', 23.043064, 113.383891],
      ['stadium', 23.042349, 113.385868],
      ['canteen1', 23.046325, 113.389898],
      ['canteen2', 23.044624, 113.387073],
      ['canteen3', 23.044526, 113.382529],
      ['canteen4', 23.044812, 113.378495],
      ['gong3', 23.038984, 113.392780],
      ['south-gate', 23.036079, 113.391189],
      ['xi6', 23.044975, 113.381453],
      ['dong9', 23.044096, 113.388428],
    ];
    for (const [id, lat, lng] of anchors) {
      const b = getCampusBuilding(id)!;
      expect(distanceMeters({ lat, lng }, b), `${id} WGS-84 drift`).toBeLessThan(15);
      expect(findNearestBuilding(lat, lng)?.building.id).toBe(id);
    }
  });

  it('latLngToLocal and localToLatLng are accurate inverses', () => {
    const sample = { lat: 23.040127, lng: 113.389745 };
    const local = latLngToLocal(sample.lat, sample.lng);
    const back = localToLatLng(local.x, local.z);
    expect(back.lat).toBeCloseTo(sample.lat, 5);
    expect(back.lng).toBeCloseTo(sample.lng, 5);
  });

  it('matches classroom strings, abbreviations, and newly calibrated buildings accurately', () => {
    expect(matchCampusBuilding('教3-305')?.id).toBe('jiao3');
    expect(matchCampusBuilding('二号大教室')?.id).toBe('big2');
    expect(matchCampusBuilding('三号大教室')?.id).toBe('big3');
    expect(matchCampusBuilding('一号大教室')?.id).toBe('big1');
    expect(matchCampusBuilding('五号大教室')?.id).toBe('big5');
    expect(matchCampusBuilding('工学一号馆203')?.id).toBe('gong1');
    expect(matchCampusBuilding('工学三号馆301')?.id).toBe('gong3');
    expect(matchCampusBuilding('实验2-401')?.id).toBe('shi2');
    expect(matchCampusBuilding('西一')?.id).toBe('xi1');
    expect(matchCampusBuilding('西六')?.id).toBe('xi6');
    expect(matchCampusBuilding('东5')?.id).toBe('dong5');
    expect(matchCampusBuilding('东11')?.id).toBe('dong11');
    expect(matchCampusBuilding('东12')?.id).toBe('dong12');
    expect(matchCampusBuilding('四饭')?.id).toBe('canteen4');
    expect(matchCampusBuilding('一饭')?.id).toBe('canteen1');
  });

  it('connects West Living Zone, East Living Zone, Teaching Zone, Labs, and Metro in both walk & bike modes', () => {
    const pairs: [string, string][] = [
      ['xi6', 'jiao3'],
      ['xi13', 'gong1'],
      ['dong12', 'big3'],
      ['canteen1', 'canteen4'],
      ['library', 'nanting-gate'],
      ['dong5', 'metro-south'],
    ];
    for (const [a, b] of pairs) {
      const walk = planCampusRoute({ kind: 'building', buildingId: a }, { kind: 'building', buildingId: b }, 'walk');
      const bike = planCampusRoute({ kind: 'building', buildingId: a }, { kind: 'building', buildingId: b }, 'bike');
      expect(walk, `walk ${a}->${b}`).not.toBeNull();
      expect(bike, `bike ${a}->${b}`).not.toBeNull();
      expect(walk!.distanceMeters).toBeGreaterThan(100);
      expect(bike!.durationMinutes).toBeLessThanOrEqual(walk!.durationMinutes);
    }
  });

  it('projects GPS coordinate starts onto the nearest road edge without backtracking', () => {
    // Standing along 知行大道 slightly east of 图书馆 (113.38980), heading east to 教1 (113.39315)
    const gpsStart = { kind: 'coord' as const, lat: 23.04072, lng: 113.39030 };
    const route = planCampusRoute(gpsStart, { kind: 'building', buildingId: 'jiao1' }, 'walk')!;
    expect(route).not.toBeNull();
    // Should head directly east (lng increasing), never backtracking west toward 113.38980
    for (const wp of route.waypoints) {
      expect(wp.lng).toBeGreaterThanOrEqual(gpsStart.lng - 0.0001);
    }
  });

  it('bike mode avoids pedestrian-only bridge stairs and park footpaths', () => {
    const walk = planCampusRoute({ kind: 'building', buildingId: 'canteen3' }, { kind: 'building', buildingId: 'gym' }, 'walk');
    const bike = planCampusRoute({ kind: 'building', buildingId: 'canteen3' }, { kind: 'building', buildingId: 'gym' }, 'bike');
    expect(walk?.steps.some((s) => s.roadName.includes('天桥'))).toBe(true);
    expect(bike?.steps.some((s) => s.roadName.includes('天桥'))).toBe(false);
    expect(bike?.steps.some((s) => s.roadName.includes('公园人行桥'))).toBe(false);
  });

  it('computes off-route distance accurately', () => {
    const route = planCampusRoute({ kind: 'building', buildingId: 'dong9' }, { kind: 'building', buildingId: 'jiao6' }, 'walk')!;
    const onRoute = distanceToRouteMeters(route.waypoints[1]!, route.waypoints);
    expect(onRoute).toBeLessThan(1);
    const farAway = distanceToRouteMeters({ lat: 23.0472, lng: 113.3782 }, route.waypoints);
    expect(farAway).toBeGreaterThan(500);
  });
});
