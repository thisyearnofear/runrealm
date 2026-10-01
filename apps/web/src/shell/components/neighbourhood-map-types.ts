/**
 * Shared shapes between `NeighbourhoodMapRenderer` and its scheduler.
 *
 * These are the *transient* map values — the picture, not the ledger. The
 * ledger owns geometry and status; nothing here is ever written back to it.
 */

export interface CellTransientValues {
  /** 0 = amber exposure, 1 = developed verdigris. */
  develop: number;
  /** 1 while a strengthened cell shows its deeper print. */
  press: number;
  /** 1 while an accepted visit is only provisionally marked. */
  exposure: number;
  /** 1 while the cell is being inspected. */
  select: number;
}

export type CellStatus = 'unvisited' | 'collected' | 'strengthened';

export interface CellRecord {
  id: string;
  status: CellStatus;
  visits: number;
}

export const SETTLED_CELL_VALUES: CellTransientValues = {
  develop: 1,
  press: 0,
  exposure: 0,
  select: 0,
};

export function statusForVisits(visits: number): CellStatus {
  return visits >= 2 ? 'strengthened' : visits === 1 ? 'collected' : 'unvisited';
}
