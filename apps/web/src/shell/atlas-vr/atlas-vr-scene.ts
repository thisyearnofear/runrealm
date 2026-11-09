import {
  ATLAS_SCHEMA_VERSION,
  isNeighbourhoodAtlas,
  NEIGHBOURHOOD_RING_SIZE,
  type NeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '@runrealm/shared-core/types/neighbourhood';
import { cellToLatLng, gridDisk } from 'h3-js';

export type Rgb = readonly [number, number, number];

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

export function buildAtlasVrScene(
  atlas: NeighbourhoodAtlas | null | undefined,
  pageIndex: number
): AtlasVrScene {
  if (!atlas || !isNeighbourhoodAtlas(atlas)) return emptyScene(0, 0);
  const pageCount = atlas.pages.length;
  const index = Math.max(0, Math.min(Math.trunc(pageIndex) || 0, pageCount - 1));
  const scene = emptyScene(index, pageCount);
  const ledger = atlas.pages[index];
  const anchor = ledger?.anchorCell;
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

  const { x: cx, y: cy, z: cz } = ATLAS_VR_TABLE.center;
  for (const { cell, east, north } of offsets) {
    const { color, edgeColor, visits } = cellAppearance(cell.id, anchor, ledger);
    const instance: AtlasVrCellInstance = {
      cellId: cell.id,
      position: { x: cx + east * scale, y: cy, z: cz - north * scale },
      height: cellHeightMeters(visits),
      color,
      edgeColor,
      visits,
      anchor: cell.id === anchor,
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
