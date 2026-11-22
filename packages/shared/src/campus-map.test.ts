import { describe, expect, it } from 'vitest';
import {
  distanceToRouteMeters,
  GDUT_HEMC_BUILDINGS,
  GDUT_HEMC_ROAD_EDGES,
  GDUT_HEMC_ROAD_NODES,
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

  it('latLngToLocal and localToLatLng are accurate inverses', () => {
    const sample = { lat: 23.0389, lng: 113.3898 };
    const local = latLngToLocal(sample.lat, sample.lng);
    const back = localToLatLng(local.x, local.z);
    expect(back.lat).toBeCloseTo(sample.lat, 5);
    expect(back.lng).toBeCloseTo(sample.lng, 5);
  });

  it('matches classroom strings, abbreviations, and user-verified canteens accurately', () => {
    expect(matchCampusBuilding('教3-305')?.id).toBe('jiao3');
    expect(matchCampusBuilding('三号大教室')?.id).toBe('big3');
    expect(matchCampusBuilding('一号大教室')?.id).toBe('big1');
    expect(matchCampusBuilding('工学一号馆203')?.id).toBe('gong1');
    expect(matchCampusBuilding('实验2-401')?.id).toBe('shi2');
    expect(matchCampusBuilding('西六')?.id).toBe('xi6');
    expect(matchCampusBuilding('东12')?.id).toBe('dong12');
    expect(matchCampusBuilding('四饭')?.id).toBe('canteen4');
    expect(matchCampusBuilding('一饭')?.id).toBe('canteen1');
  });

  it('connects West Living Zone, East Living Zone, Teaching Zone, and Labs in both walk & bike modes', () => {
    const pairs: [string, string][] = [
      ['xi6', 'jiao3'],
      ['xi13', 'gong1'],
      ['dong12', 'big3'],
      ['canteen1', 'canteen4'],
      ['library', 'nanting-gate'],
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
