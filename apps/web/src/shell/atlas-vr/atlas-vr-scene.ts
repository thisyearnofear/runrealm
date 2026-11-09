import {
  ATLAS_SCHEMA_VERSION,
  isNeighbourhoodAtlas,
  NEIGHBOURHOOD_RING_SIZE,
  type NeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '@runrealm/shared-core/types/neighbourhood';
import { cellToLatLng, gridDisk } from 'h3-js';

export type Rgb = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

export const ATLAS_VR_COLORS = {
  blueprint: [0x0d / 255, 0x2b / 255, 0x3e / 255] as Rgb,
  raised: [0x17 / 255, 0x3d / 255, 0x52 / 255] as Rgb,
  chalk: [0xf8 / 255, 0xf4 / 255, 0xe8 / 255] as Rgb,
  verdigris: [0x4f / 255, 0xae / 255, 0x8b / 255] as Rgb,
  verdigrisDeep: [0x2e / 255, 0x7f / 255, 0x60 / 255] as Rgb,
  amber: [0xf2 / 255, 0xa5 / 255, 0x41 / 255] as Rgb,
  ink: [0x10 / 255, 0x26 / 255, 0x33 / 255] as Rgb,
  muted: [0x9f / 255, 0xb8 / 255, 0xbf / 255] as Rgb,
};

export const ATLAS_VR_TABLE = {
  diameter: 0.7,
  center: { x: 0, y: -0.35, z: -1.1 },
  rimSlabHeight: 0.028,
} as const;

export const ATLAS_VR_EXTRUSION = {
  baseHeight: 0.012,
  perVisit: 0.02,
  visitCap: 8,
} as const;

export const DEVELOP_COHORT_WINDOW_MS = 6 * 60 * 60 * 1000;
export const DEVELOP_DURATION_MS = 1200;
export const VIGNETTE_LIFT = 2;
export const GRAB_DISTANCE_M = 0.5;
export const TRAIL_LIFT_M = 0.012;
export const TRAIL_SUBDIVISIONS = 8;

const METERS_PER_DEG_LAT = 110_540;
const METERS_PER_DEG_LNG = 111_320;
const SQRT3 = Math.sqrt(3);
const CELL_GAP_FACTOR = 0.92;
const TABLE_FILL = 0.86;

export interface AtlasVrCellInstance {
  cellId: string;
  position: { x: number; y: number; z: number };
  height: number;
  color: Rgb;
  edgeColor: Rgb;
  visits: number;
  anchor: boolean;
  label?: string;
  lastVisitedAt: number | null;
  develop: number;
  dimmed: boolean;
  newest: boolean;
  deepest: boolean;
  lift: number;
}

export interface AtlasVrTable {
  center: { x: number; y: number; z: number };
  radius: number;
  topY: number;
}

export interface AtlasVrScene {
  cells: AtlasVrCellInstance[];
  cellRadius: number;
  table: AtlasVrTable;
  pageIndex: number;
  pageCount: number;
  anchorCell: string | null;
}

export interface AtlasVrBuildOptions {
  scrubAt?: number | null;
}

export type AtlasVrCredit = 'new' | 'strengthened' | null;

export interface AtlasVrVignette {
  cellId: string;
  found: boolean;
  collected: boolean;
  anchor: boolean;
  visits: number;
  lastVisitedAt: number | null;
  creditedByLatestRun: AtlasVrCredit;
  deepest: boolean;
}

export interface AtlasVrTablePose {
  dx: number;
  dz: number;
  yaw: number;
  dy: number;
}

interface RingCell {
  id: string;
  lat: number;
  lng: number;
}

function emptyScene(pageIndex: number, pageCount: number): AtlasVrScene {
  return {
    cells: [],
    cellRadius: ATLAS_VR_TABLE.diameter / 12,
    table: {
      center: { ...ATLAS_VR_TABLE.center },
      radius: ATLAS_VR_TABLE.diameter / 2,
      topY: ATLAS_VR_TABLE.center.y,
    },
    pageIndex,
    pageCount,
    anchorCell: null,
  };
}

function ringCells(anchor: string): RingCell[] {
  const ids = gridDisk(anchor, NEIGHBOURHOOD_RING_SIZE).slice().sort();
  const out: RingCell[] = [];
  for (const id of ids) {
    const [lat, lng] = cellToLatLng(id);
    out.push({ id, lat, lng });
  }
  return out;
}

function minSpacingMeters(cells: RingCell[], anchorLat: number): number {
  const cosLat = Math.cos((anchorLat * Math.PI) / 180);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const dx = (cells[j].lng - cells[i].lng) * METERS_PER_DEG_LNG * cosLat;
      const dy = (cells[j].lat - cells[i].lat) * METERS_PER_DEG_LAT;
      const d = Math.hypot(dx, dy);
      if (d > 0.001 && d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : 0;
}

function cellAppearance(
  cellId: string,
  anchor: string,
  ledger: NeighbourhoodLedger
): { color: Rgb; edgeColor: Rgb; visits: number } {
  const record = ledger.cells[cellId];
  const visits = record ? record.visits : 0;
  if (cellId === anchor) {
    return { color: ATLAS_VR_COLORS.amber, edgeColor: ATLAS_VR_COLORS.chalk, visits };
  }
  if (!record || visits <= 0) {
    return { color: ATLAS_VR_COLORS.raised, edgeColor: ATLAS_VR_COLORS.chalk, visits: 0 };
  }
  if (visits >= 2) {
    return { color: ATLAS_VR_COLORS.verdigrisDeep, edgeColor: ATLAS_VR_COLORS.ink, visits };
  }
  return { color: ATLAS_VR_COLORS.verdigris, edgeColor: ATLAS_VR_COLORS.ink, visits };
}

export function cellHeightMeters(visits: number): number {
  const clamped = Math.max(0, Math.min(visits, ATLAS_VR_EXTRUSION.visitCap));
  return ATLAS_VR_EXTRUSION.baseHeight + clamped * ATLAS_VR_EXTRUSION.perVisit;
}

export function developCohortCellIds(ledger: NeighbourhoodLedger): Set<string> {
  let max = Number.NEGATIVE_INFINITY;
  for (const record of Object.values(ledger.cells)) {
    if (record.lastVisitedAt > max) max = record.lastVisitedAt;
  }
  const out = new Set<string>();
  if (!Number.isFinite(max)) return out;
  for (const [id, record] of Object.entries(ledger.cells)) {
    if (max - record.lastVisitedAt <= DEVELOP_COHORT_WINDOW_MS) out.add(id);
  }
  return out;
}

export function creditedCellIds(ledger: NeighbourhoodLedger): string[] {
  const summary = ledger.lastSummary;
  if (!summary) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...summary.newCellIds, ...summary.strengthenedCellIds]) {
    if (!seen.has(id) && ledger.cells[id]) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function buildCellVignette(
  ledger: NeighbourhoodLedger | null | undefined,
  cellId: string
): AtlasVrVignette {
  const record = ledger?.cells?.[cellId];
  const summary = ledger?.lastSummary ?? null;
  let creditedByLatestRun: AtlasVrCredit = null;
  if (summary) {
    if (summary.newCellIds.includes(cellId)) creditedByLatestRun = 'new';
    else if (summary.strengthenedCellIds.includes(cellId)) creditedByLatestRun = 'strengthened';
  }
  const visits = record ? record.visits : 0;
  let deepest = false;
  if (record && visits > 0 && ledger) {
    deepest = true;
    for (const other of Object.values(ledger.cells)) {
      if (other.visits > visits) {
        deepest = false;
        break;
      }
    }
  }
  return {
    cellId,
    found: Boolean(record) || ledger?.anchorCell === cellId,
    collected: Boolean(record) && visits > 0,
    anchor: ledger?.anchorCell === cellId,
    visits,
    lastVisitedAt: record ? record.lastVisitedAt : null,
    creditedByLatestRun,
    deepest,
  };
}

export function greedyTrailOrder(scene: AtlasVrScene, cellIds: readonly string[]): string[] {
  const byId = new Map(scene.cells.map((c) => [c.cellId, c] as const));
  const remaining = cellIds
    .map((id) => byId.get(id))
    .filter((c): c is AtlasVrCellInstance => Boolean(c));
  const order: string[] = [];
  if (remaining.length === 0) return order;
  const nearest = (x: number, z: number): number => {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = Math.hypot(remaining[i].position.x - x, remaining[i].position.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  let cursor = nearest(scene.table.center.x, scene.table.center.z);
  let current = remaining.splice(cursor, 1)[0];
  order.push(current.cellId);
  while (remaining.length > 0) {
    cursor = nearest(current.position.x, current.position.z);
    current = remaining.splice(cursor, 1)[0];
    order.push(current.cellId);
  }
  return order;
}

export function buildTrailPath(
  scene: AtlasVrScene,
  cellIds: readonly string[]
): Array<{ x: number; y: number; z: number }> {
  const byId = new Map(scene.cells.map((c) => [c.cellId, c] as const));
  const out: Array<{ x: number; y: number; z: number }> = [];
  for (const id of greedyTrailOrder(scene, cellIds)) {
    const cell = byId.get(id);
    if (!cell) continue;
    out.push({
      x: cell.position.x,
      y: cell.position.y + cell.height + TRAIL_LIFT_M,
      z: cell.position.z,
    });
  }
  return out;
}

export function sampleTrailPath(
  points: ReadonlyArray<{ x: number; y: number; z: number }>,
  subdivisions = TRAIL_SUBDIVISIONS
): Float32Array {
  if (points.length === 0) return new Float32Array(0);
  const sub = Math.max(1, Math.trunc(subdivisions));
  const out = new Float32Array(((points.length - 1) * sub + 1) * 3);
  let o = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (let s = 0; s < sub; s += 1) {
      const t = s / sub;
      out[o] = a.x + (b.x - a.x) * t;
      out[o + 1] = a.y + (b.y - a.y) * t;
      out[o + 2] = a.z + (b.z - a.z) * t;
      o += 3;
    }
  }
  const last = points[points.length - 1];
  out[o] = last.x;
  out[o + 1] = last.y;
  out[o + 2] = last.z;
  return out;
}

export function pickCellAt(scene: AtlasVrScene, x: number, z: number): AtlasVrCellInstance | null {
  let best: AtlasVrCellInstance | null = null;
  let bestD = scene.cellRadius;
  for (const cell of scene.cells) {
    const d = Math.hypot(cell.position.x - x, cell.position.z - z);
    if (d <= bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

export function pointInTableBounds(scene: AtlasVrScene, x: number, z: number): boolean {
  const dx = x - scene.table.center.x;
  const dz = z - scene.table.center.z;
  return Math.hypot(dx, dz) <= scene.table.radius * 1.06;
}

export function intersectTableTop(
  scene: AtlasVrScene,
  origin: Vec3,
  dir: Vec3
): { x: number; z: number } | null {
  const dy = dir[1];
  if (Math.abs(dy) < 1e-6) return null;
  const t = (scene.table.topY - origin[1]) / dy;
  if (t <= 0) return null;
  const x = origin[0] + dir[0] * t;
  const z = origin[2] + dir[2] * t;
  if (!pointInTableBounds(scene, x, z)) return null;
  return { x, z };
}

export function withinGrabDistance(scene: AtlasVrScene, point: Vec3): boolean {
  const dx = Math.hypot(point[0] - scene.table.center.x, point[2] - scene.table.center.z);
  const radial = Math.max(0, dx - scene.table.radius);
  const vertical = Math.abs(point[1] - scene.table.topY);
  return Math.hypot(radial, vertical) <= GRAB_DISTANCE_M;
}

export function sceneSpaceRay(
  origin: Vec3,
  dir: Vec3,
  pose: AtlasVrTablePose
): { origin: Vec3; dir: Vec3 } {
  const c = ATLAS_VR_TABLE.center;
  const cos = Math.cos(-pose.yaw);
  const sin = Math.sin(-pose.yaw);
  const ox = origin[0] - pose.dx - c.x;
  const oy = origin[1] - pose.dy - c.y;
  const oz = origin[2] - pose.dz - c.z;
  const nx = ox * cos + oz * sin;
  const nz = -ox * sin + oz * cos;
  const dx = dir[0] * cos + dir[2] * sin;
  const dz = -dir[0] * sin + dir[2] * cos;
  return {
    origin: [nx + c.x, oy + c.y, nz + c.z],
    dir: [dx, dir[1], dz],
  };
}

export function worldPointToScene(point: Vec3, pose: AtlasVrTablePose): Vec3 {
  const c = ATLAS_VR_TABLE.center;
  const cos = Math.cos(-pose.yaw);
  const sin = Math.sin(-pose.yaw);
  const ox = point[0] - pose.dx - c.x;
  const oz = point[2] - pose.dz - c.z;
  return [ox * cos + oz * sin + c.x, point[1] - pose.dy, -ox * sin + oz * cos + c.z];
}

export function identityTablePose(dy = 0): AtlasVrTablePose {
  return { dx: 0, dz: 0, yaw: 0, dy };
}

export function scrubTimestamps(ledger: NeighbourhoodLedger): number[] {
  const seen = new Set<number>();
  for (const record of Object.values(ledger.cells)) {
    seen.add(record.lastVisitedAt);
  }
  return [...seen].sort((a, b) => a - b);
}

function isDimmed(
  cellId: string,
  ledger: NeighbourhoodLedger,
  scrubAt: number | null | undefined
): boolean {
  if (scrubAt === null || scrubAt === undefined) return false;
  const record = ledger.cells[cellId];
  if (!record) return false;
  return record.lastVisitedAt > scrubAt;
}

export function buildAtlasVrScene(
  atlas: NeighbourhoodAtlas | null | undefined,
  pageIndex: number,
  options?: AtlasVrBuildOptions
): AtlasVrScene {
  if (!atlas || !isNeighbourhoodAtlas(atlas)) return emptyScene(0, 0);
  const pageCount = atlas.pages.length;
  const index = Math.max(0, Math.min(Math.trunc(pageIndex) || 0, pageCount - 1));
  const scene = emptyScene(index, pageCount);
  const ledger = atlas.pages[index];
  const anchor = ledger?.anchorCell;
  scene.anchorCell = anchor ?? null;
  if (!anchor) return scene;

  let ring: RingCell[];
  try {
    ring = ringCells(anchor);
  } catch {
    return scene;
  }
  if (ring.length === 0) return scene;

  const [anchorLat, anchorLng] = cellToLatLng(anchor);
  const cosLat = Math.cos((anchorLat * Math.PI) / 180);
  const spacingMeters = minSpacingMeters(ring, anchorLat);
  if (spacingMeters <= 0) return scene;

  let maxRadiusMeters = 0;
  const offsets = ring.map((cell) => {
    const east = (cell.lng - anchorLng) * METERS_PER_DEG_LNG * cosLat;
    const north = (cell.lat - anchorLat) * METERS_PER_DEG_LAT;
    const r = Math.hypot(east, north);
    if (r > maxRadiusMeters) maxRadiusMeters = r;
    return { cell, east, north };
  });

  const extentMeters = 2 * maxRadiusMeters + spacingMeters;
  const scale = (ATLAS_VR_TABLE.diameter * TABLE_FILL) / extentMeters;
  scene.cellRadius = (spacingMeters / SQRT3) * scale * CELL_GAP_FACTOR;

  const cohort = developCohortCellIds(ledger);
  let maxVisits = 0;
  for (const record of Object.values(ledger.cells)) {
    if (record.visits > maxVisits) maxVisits = record.visits;
  }
  const scrubAt = options?.scrubAt;

  const { x: cx, y: cy, z: cz } = ATLAS_VR_TABLE.center;
  for (const { cell, east, north } of offsets) {
    const { color, edgeColor, visits } = cellAppearance(cell.id, anchor, ledger);
    const record = ledger.cells[cell.id];
    const dimmed = isDimmed(cell.id, ledger, scrubAt);
    const instance: AtlasVrCellInstance = {
      cellId: cell.id,
      position: { x: cx + east * scale, y: cy, z: cz - north * scale },
      height: cellHeightMeters(visits),
      color: dimmed ? ATLAS_VR_COLORS.raised : color,
      edgeColor: dimmed ? ATLAS_VR_COLORS.muted : edgeColor,
      visits,
      anchor: cell.id === anchor,
      lastVisitedAt: record ? record.lastVisitedAt : null,
      develop: cohort.has(cell.id) ? 0 : 1,
      dimmed,
      newest: cohort.has(cell.id),
      deepest: visits > 0 && visits >= maxVisits,
      lift: 0,
    };
    if (instance.anchor) instance.label = 'anchor';
    scene.cells.push(instance);
  }
  return scene;
}

export function clampPageIndex(
  atlas: NeighbourhoodAtlas | null | undefined,
  index: number
): number {
  if (!atlas || !isNeighbourhoodAtlas(atlas)) return 0;
  return Math.max(0, Math.min(Math.trunc(index) || 0, atlas.pages.length - 1));
}

export const ATLAS_VR_SCHEMA_VERSION = ATLAS_SCHEMA_VERSION;
