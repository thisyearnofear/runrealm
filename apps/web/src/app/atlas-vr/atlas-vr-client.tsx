'use client';

import {
  ATLAS_STORAGE_KEY,
  isNeighbourhoodAtlas,
  type NeighbourhoodAtlas,
  type NeighbourhoodLedger,
} from '@runrealm/shared-core/types/neighbourhood';
import {
  ATLAS_BACKUP_MAX_BYTES,
  AtlasBackupError,
  parseAtlasBackup,
} from '@runrealm/shared-core/utils/atlas-backup';
import {
  clampAtlasViewPage,
  readAtlasViewPage,
  recordAtlasViewPage,
} from '@runrealm/shared-core/utils/atlas-view';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AtlasVrMonoView,
  AtlasVrRenderer,
  monoPickRay,
  monoViewFit,
} from '../../shell/atlas-vr/atlas-vr-renderer';
import {
  type AtlasVrScene,
  type AtlasVrTablePose,
  type AtlasVrVignette,
  buildAtlasVrScene,
  buildCellVignette,
  buildTrailPath,
  clampPageIndex,
  creditedCellIds,
  DEVELOP_DURATION_MS,
  identityTablePose,
  intersectTableTop,
  pickCellAt,
  sampleTrailPath,
  scrubTimestamps,
} from '../../shell/atlas-vr/atlas-vr-scene';
import { createDemoAtlas, DEMO_ATLAS_LABEL } from '../../shell/atlas-vr/demo-atlas';
import { useXrSession } from '../../shell/atlas-vr/use-xr-session';

type AtlasSource = 'demo' | 'device' | 'file';
type DevelopState = 'idle' | 'animating' | 'done';

const LIFT_MS = 350;
const TRAIL_SWEEP_MS = 2400;
const TRAIL_HOLD_MS = 1800;
const ORBIT_AZ_LIMIT = 0.65;
const ORBIT_EL_MIN = 0.35;
const ORBIT_EL_MAX = 1.15;
const CLICK_SLOP_PX = 6;
const VR_INVITE_HINT = 'Headset ready — step in';

function backupErrorMessage(error: unknown): string {
  if (error instanceof AtlasBackupError) {
    if (error.code === 'version') {
      return 'That backup was written by an unsupported atlas version.';
    }
    if (error.code === 'too-large') {
      return 'That file is too large to be an atlas backup.';
    }
    if (error.code === 'invalid') {
      return 'That file is not a valid RunRealm atlas backup.';
    }
  }
  return 'Could not read that backup file.';
}

function readDeviceAtlas(): NeighbourhoodAtlas | null {
  try {
    const raw = window.localStorage.getItem(ATLAS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isNeighbourhoodAtlas(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function anchorPageIndex(atlas: NeighbourhoodAtlas): number {
  const index = atlas.pages.findIndex((page) => page.anchorCell === atlas.viewAnchor);
  return index >= 0 ? index : 0;
}

function rememberedPageIndex(atlas: NeighbourhoodAtlas): number {
  const stored = readAtlasViewPage();
  return stored === null ? 0 : clampAtlasViewPage(stored, atlas.pages.length);
}

function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function vignetteStatusLine(v: AtlasVrVignette): string {
  const parts = [`${v.visits} visit${v.visits === 1 ? '' : 's'}`];
  if (v.creditedByLatestRun === 'new') parts.push('collected on your latest outing');
  if (v.creditedByLatestRun === 'strengthened') {
    parts.push('strengthened on your latest outing');
  }
  if (v.deepest) parts.push('deepest ground — your ghost stands here');
  return parts.join(' · ');
}

export default function AtlasVrClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AtlasVrRenderer | null>(null);
  const [atlas, setAtlas] = useState<NeighbourhoodAtlas>(() => createDemoAtlas());
  const [source, setSource] = useState<AtlasSource>('demo');
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [vignette, setVignette] = useState<AtlasVrVignette | null>(null);
  const [cellHint, setCellHint] = useState<string | null>(null);
  const [developState, setDevelopState] = useState<DevelopState>('idle');
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [trailOn, setTrailOn] = useState(false);
  const atlasRef = useRef(atlas);
  atlasRef.current = atlas;
  const pageIndexRef = useRef(pageIndex);
  pageIndexRef.current = pageIndex;
  const sceneRef = useRef<AtlasVrScene | null>(null);
  const ledgerRef = useRef<NeighbourhoodLedger | null>(null);
  const vignetteOpenRef = useRef(false);
  const vignetteCellRef = useRef<string | null>(null);
  const tablePoseRef = useRef<AtlasVrTablePose>(identityTablePose());
  const reducedMotionRef = useRef(false);
  const xrActiveRef = useRef(false);
  const animRef = useRef({ developing: new Set<number>() });
  const baseViewRef = useRef<AtlasVrMonoView | null>(null);
  const camViewRef = useRef<AtlasVrMonoView | null>(null);
  const camTargetRef = useRef<AtlasVrMonoView | null>(null);
  const trailRef = useRef({ t: 0, phase: 'off' as 'off' | 'sweep' | 'hold', holdMs: 0 });
  const pointerRef = useRef({
    down: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });
  const stopsRef = useRef<number[]>([]);

  const cyclePage = useCallback((delta: number) => {
    vignetteOpenRef.current = false;
    vignetteCellRef.current = null;
    setVignette(null);
    const next = clampPageIndex(atlasRef.current, pageIndexRef.current + delta);
    if (next !== pageIndexRef.current) {
      pageIndexRef.current = next;
      recordAtlasViewPage(next);
      setPageIndex(next);
    }
  }, []);

  const ledger = atlas.pages[Math.max(0, Math.min(pageIndex, atlas.pages.length - 1))] ?? null;
  ledgerRef.current = ledger;

  const stops = useMemo(() => (ledger ? scrubTimestamps(ledger) : []), [ledger]);
  stopsRef.current = stops;
  const scrubAt = scrubIndex !== null && scrubIndex < stops.length ? stops[scrubIndex] : null;
  const effectiveScrubIndex = scrubIndex ?? stops.length;

  const scene = useMemo(
    () => buildAtlasVrScene(atlas, pageIndex, { scrubAt }),
    [atlas, pageIndex, scrubAt]
  );

  const selectCell = useCallback(
    (cellId: string | null, cycleOnMiss: boolean): string | void => {
      const current = sceneRef.current;
      if (!cellId) {
        if (vignetteOpenRef.current) {
          vignetteOpenRef.current = false;
          vignetteCellRef.current = null;
          setVignette(null);
          return 'Back to the full table.';
        }
        if (cycleOnMiss) cyclePage(1);
        return;
      }
      const cell = current?.cells.find((c) => c.cellId === cellId);
      const data = buildCellVignette(ledgerRef.current, cellId);
      if (!cell || !data.collected) {
        setCellHint('That block is not yet collected — chalk outline only.');
        return 'Not yet collected.';
      }
      vignetteOpenRef.current = true;
      vignetteCellRef.current = cellId;
      setVignette(data);
      setCellHint(null);
      const base = baseViewRef.current;
      const target = camTargetRef.current;
      if (base && target) {
        camTargetRef.current = {
          azimuth: target.azimuth,
          elevation: Math.min(Math.max(target.elevation, 0.55), 1.0),
          distance: Math.max(base.distance * 0.38, 0.28),
          target: [cell.position.x, cell.position.y + cell.height, cell.position.z],
        };
      }
      return vignetteStatusLine(data);
    },
    [cyclePage]
  );

  const closeVignette = useCallback(() => {
    vignetteOpenRef.current = false;
    vignetteCellRef.current = null;
    setVignette(null);
    const base = baseViewRef.current;
    const target = camTargetRef.current;
    if (base && target) {
      camTargetRef.current = {
        ...target,
        distance: base.distance,
        target: [...base.target],
      };
    }
  }, []);

  const stepScrub = useCallback(
    (delta: number): string => {
      const all = stopsRef.current;
      if (all.length === 0) return 'No visit dates to scrub through.';
      const next = Math.max(0, Math.min(all.length, effectiveScrubIndex + delta));
      setScrubIndex(next);
      return next >= all.length ? 'Atlas as of latest' : `Atlas as of ${formatDay(all[next])}`;
    },
    [effectiveScrubIndex]
  );

  const replayTrail = useCallback((): string => {
    const current = sceneRef.current;
    const page = ledgerRef.current;
    if (!current || !page) return 'No atlas page is loaded.';
    const ids = creditedCellIds(page);
    if (ids.length === 0) return 'No credited blocks on this page to replay.';
    const path = buildTrailPath(current, ids);
    if (path.length < 2) return 'The latest outing touched a single block — nothing to trace.';
    const renderer = rendererRef.current;
    renderer?.setTrailPath(sampleTrailPath(path));
    trailRef.current = {
      t: reducedMotionRef.current ? 1 : 0,
      phase: reducedMotionRef.current ? 'hold' : 'sweep',
      holdMs: 0,
    };
    setTrailOn(true);
    return "Your outing's blocks, replayed.";
  }, []);

  const developNewest = useCallback(() => {
    const current = sceneRef.current;
    if (!current) return;
    const instant = reducedMotionRef.current || !rendererRef.current;
    animRef.current.developing.clear();
    let cohort = 0;
    current.cells.forEach((cell, i) => {
      if (!cell.newest) return;
      cohort += 1;
      cell.develop = instant ? 1 : 0;
      if (instant) rendererRef.current?.updateCellInstance(i, cell, current.cellRadius);
      else animRef.current.developing.add(i);
    });
    if (cohort === 0) {
      setDevelopState('idle');
      return;
    }
    setDevelopState(instant ? 'done' : 'animating');
  }, []);

  const xr = useXrSession({
    canvasRef,
    rendererRef,
    getScene: () => sceneRef.current,
    tablePoseRef,
    vignetteOpenRef,
    onCyclePage: cyclePage,
    onSelectCell: (id) => selectCell(id, true),
    onScrubStep: stepScrub,
    onReplay: replayTrail,
  });
  xrActiveRef.current = xr.active;

  useEffect(() => {
    document.body.classList.add('atlas-vr-route');
    reducedMotionRef.current =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stored = readDeviceAtlas();
    if (stored) {
      setAtlas(stored);
      setSource('device');
      setPageIndex(anchorPageIndex(stored));
    } else {
      setPageIndex(rememberedPageIndex(atlasRef.current));
    }
    return () => document.body.classList.remove('atlas-vr-route');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = AtlasVrRenderer.create(canvas);
    rendererRef.current = renderer;
    setWebgl(renderer?.ready ?? null);
    let raf = 0;
    let lastT = 0;
    const loop = (time: number) => {
      raf = window.requestAnimationFrame(loop);
      const r = rendererRef.current;
      const current = sceneRef.current;
      const dt = lastT > 0 ? Math.min(60, time - lastT) : 16;
      lastT = time;
      if (!r || !current) return;
      const developing = animRef.current.developing;
      if (developing.size > 0) {
        for (const i of Array.from(developing)) {
          const cell = current.cells[i];
          cell.develop = Math.min(1, cell.develop + dt / DEVELOP_DURATION_MS);
          r.updateCellInstance(i, cell, current.cellRadius);
          if (cell.develop >= 1) developing.delete(i);
        }
        if (developing.size === 0) setDevelopState('done');
      }
      const vignetteId = vignetteOpenRef.current ? vignetteCellRef.current : null;
      for (let i = 0; i < current.cells.length; i += 1) {
        const cell = current.cells[i];
        const goal = cell.cellId === vignetteId ? 1 : 0;
        const diff = goal - cell.lift;
        if (Math.abs(diff) > 0.001) {
          const step = dt / LIFT_MS;
          cell.lift += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
          r.updateCellInstance(i, cell, current.cellRadius);
        }
      }
      const cam = camViewRef.current;
      const goal = camTargetRef.current;
      if (cam && goal) {
        const f = 1 - Math.exp(-dt / 160);
        cam.azimuth += (goal.azimuth - cam.azimuth) * f;
        cam.elevation += (goal.elevation - cam.elevation) * f;
        cam.distance += (goal.distance - cam.distance) * f;
        for (let k = 0; k < 3; k += 1) {
          cam.target[k] += (goal.target[k] - cam.target[k]) * f;
        }
      }
      const trail = trailRef.current;
      if (trail.phase === 'sweep') {
        trail.t = Math.min(1, trail.t + dt / TRAIL_SWEEP_MS);
        r.setTrailProgress(trail.t);
        if (trail.t >= 1) trail.phase = 'hold';
      } else if (trail.phase === 'hold') {
        trail.holdMs += dt;
        r.setTrailProgress(1, trail.holdMs);
        if (trail.holdMs >= TRAIL_HOLD_MS) {
          trail.phase = 'off';
          r.clearTrail();
          setTrailOn(false);
        }
      }
      if (xrActiveRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (!camViewRef.current || !baseViewRef.current) {
        const fit = monoViewFit(w / h);
        baseViewRef.current = fit;
        camViewRef.current = { ...fit, target: [...fit.target] };
        camTargetRef.current = { ...fit, target: [...fit.target] };
      }
      r.renderMono(canvas.width, canvas.height, camViewRef.current ?? undefined);
    };
    if (renderer) {
      renderer.setScene(buildAtlasVrScene(atlasRef.current, 0));
      raf = window.requestAnimationFrame(loop);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current = scene;
    const r = rendererRef.current;
    r?.setScene(scene);
    const instant = reducedMotionRef.current || !r;
    const developing = animRef.current.developing;
    developing.clear();
    let cohort = 0;
    scene.cells.forEach((cell, i) => {
      if (!cell.newest) return;
      cohort += 1;
      if (instant) {
        cell.develop = 1;
        r?.updateCellInstance(i, cell, scene.cellRadius);
      } else {
        developing.add(i);
      }
    });
    setDevelopState(cohort === 0 ? 'idle' : instant ? 'done' : 'animating');
  }, [scene]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inControl =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (event.key === 'Escape' && vignetteOpenRef.current) {
        closeVignette();
        return;
      }
      if (inControl) return;
      if (event.key === 'ArrowRight') cyclePage(1);
      else if (event.key === 'ArrowLeft') cyclePage(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cyclePage, closeVignette]);

  useEffect(() => {
    if (!cellHint) return;
    const t = window.setTimeout(() => setCellHint(null), 4000);
    return () => window.clearTimeout(t);
  }, [cellHint]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerRef.current = {
      down: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointerRef.current;
    if (!p.down) return;
    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > CLICK_SLOP_PX) {
      p.moved = true;
    }
    const goal = camTargetRef.current;
    if (!goal) return;
    goal.azimuth = Math.max(-ORBIT_AZ_LIMIT, Math.min(ORBIT_AZ_LIMIT, goal.azimuth + dx * 0.005));
    goal.elevation = Math.max(ORBIT_EL_MIN, Math.min(ORBIT_EL_MAX, goal.elevation + dy * 0.003));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = pointerRef.current;
      p.down = false;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      if (p.moved) return;
      const current = sceneRef.current;
      const cam = camViewRef.current;
      const canvas = canvasRef.current;
      if (!current || !cam || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
      const ray = monoPickRay(cam, ndcX, ndcY, rect.width / rect.height);
      const hit = intersectTableTop(current, ray.origin, ray.dir);
      const cell = hit ? pickCellAt(current, hit.x, hit.z) : null;
      selectCell(cell ? cell.cellId : null, false);
    },
    [selectCell]
  );

  const loadDevice = useCallback(() => {
    const stored = readDeviceAtlas();
    if (!stored) {
      setNotice(null);
      setError('No atlas is stored on this device yet. Try the demo atlas or a backup file.');
      return;
    }
    setAtlas(stored);
    setSource('device');
    setPageIndex(anchorPageIndex(stored));
    setScrubIndex(null);
    closeVignette();
    setError(null);
    setNotice("Loaded this device's atlas.");
  }, [closeVignette]);

  const loadDemo = useCallback(() => {
    const demo = createDemoAtlas();
    setAtlas(demo);
    setSource('demo');
    setPageIndex(rememberedPageIndex(demo));
    setScrubIndex(null);
    closeVignette();
    setError(null);
    setNotice(null);
  }, [closeVignette]);

  const onFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.target;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      if (file.size > ATLAS_BACKUP_MAX_BYTES) {
        setNotice(null);
        setError('That file is too large to be an atlas backup.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const backup = parseAtlasBackup(String(reader.result));
          setAtlas(backup.atlas);
          setSource('file');
          setPageIndex(rememberedPageIndex(backup.atlas));
          setScrubIndex(null);
          closeVignette();
          setError(null);
          setNotice(
            `Restored ${backup.atlas.pages.length} neighbourhood page${
              backup.atlas.pages.length === 1 ? '' : 's'
            } from the backup file.`
          );
        } catch (e) {
          setNotice(null);
          setError(backupErrorMessage(e));
        }
      };
      reader.onerror = () => {
        setNotice(null);
        setError('Could not read that file.');
      };
      reader.readAsText(file);
    },
    [closeVignette]
  );

  const pageCount = scene.pageCount;
  const shownPage = scene.pageIndex + 1;
  const collected = scene.cells.filter((c) => c.visits > 0 || c.anchor).length;
  const hasCohort = scene.cells.some((c) => c.newest);
  const hasTrail = ledger !== null && creditedCellIds(ledger).length > 0;
  const scrubLabel = scrubAt === null ? 'Atlas as of latest' : `Atlas as of ${formatDay(scrubAt)}`;

  return (
    <main className="atlas-vr-page" aria-labelledby="atlas-vr-title">
      <header className="atlas-vr-header">
        <p className="atlas-vr-kicker">RunRealm · WebXR prototype</p>
        <h1 id="atlas-vr-title">Atlas VR</h1>
        <p className="atlas-vr-sub">
          Your neighbourhood atlas as a physical map table — blueprint paper, chalk edges, verdigris
          blocks raised by every outing. Drag the table to orbit it, tap a block to inspect it. The
          flat view below is the same scene the headset gets.
        </p>
      </header>

      <section className="atlas-vr-stage" aria-label="Atlas scene preview">
        <canvas
          ref={canvasRef}
          className="atlas-vr-canvas"
          role="img"
          aria-label="Three-dimensional preview of the neighbourhood atlas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        {vignette && (
          <aside className="atlas-vr-vignette" aria-label="Block vignette">
            <p className="atlas-vr-vignette-kicker">Block vignette</p>
            <p className="atlas-vr-vignette-id">…{vignette.cellId.slice(-6)}</p>
            <dl className="atlas-vr-vignette-facts">
              <div>
                <dt>Visits</dt>
                <dd>
                  {vignette.visits}
                  {vignette.anchor ? ' · anchor block' : ''}
                </dd>
              </div>
              <div>
                <dt>Last visited</dt>
                <dd>{vignette.lastVisitedAt ? formatDay(vignette.lastVisitedAt) : '—'}</dd>
              </div>
              {vignette.creditedByLatestRun && (
                <div>
                  <dt>Latest outing</dt>
                  <dd>
                    {vignette.creditedByLatestRun === 'new'
                      ? 'Collected on your latest outing'
                      : 'Strengthened on your latest outing'}
                  </dd>
                </div>
              )}
              {vignette.deepest && (
                <div>
                  <dt>Ghost</dt>
                  <dd>Deepest ground — your ghost stands here</dd>
                </div>
              )}
            </dl>
            <div className="atlas-vr-vignette-actions">
              {hasTrail && (
                <button
                  type="button"
                  className="atlas-vr-btn"
                  onClick={() => {
                    replayTrail();
                  }}
                >
                  Replay last outing
                </button>
              )}
              <button type="button" className="atlas-vr-btn" onClick={closeVignette}>
                Back to table
              </button>
            </div>
          </aside>
        )}
        {webgl === false && (
          <output className="atlas-vr-fallback">
            WebGL2 is not available in this browser, so the 3D preview is off. The atlas data and
            controls still work.
          </output>
        )}
      </section>

      <section className="atlas-vr-controls" aria-label="Atlas source controls">
        <div className="atlas-vr-source">
          <button type="button" className="atlas-vr-btn" onClick={loadDevice}>
            This device
          </button>
          <label className="atlas-vr-btn atlas-vr-file">
            Load atlas backup
            <input
              type="file"
              accept=".json,application/json"
              onChange={onFile}
              aria-label="Load atlas backup file"
            />
          </label>
          <button type="button" className="atlas-vr-btn" onClick={loadDemo}>
            Demo atlas
          </button>
        </div>
        {source === 'demo' && <p className="atlas-vr-demo-note">{DEMO_ATLAS_LABEL}</p>}
        {source === 'device' && <p className="atlas-vr-demo-note">Atlas stored on this device</p>}
        {source === 'file' && (
          <p className="atlas-vr-demo-note">Atlas from backup file — not saved to this device</p>
        )}

        <div className="atlas-vr-pagenav">
          <button
            type="button"
            className="atlas-vr-btn"
            onClick={() => cyclePage(-1)}
            disabled={shownPage <= 1}
          >
            ← Prev
          </button>
          <p className="atlas-vr-pageind" aria-live="polite">
            Neighbourhood {shownPage} of {pageCount}
            {pageCount > 0 ? ` · ${collected} of ${scene.cells.length} blocks held` : ''}
          </p>
          <button
            type="button"
            className="atlas-vr-btn"
            onClick={() => cyclePage(1)}
            disabled={shownPage >= pageCount}
          >
            Next →
          </button>
        </div>

        <div className="atlas-vr-actions">
          <button
            type="button"
            className="atlas-vr-btn"
            onClick={developNewest}
            disabled={!hasCohort}
          >
            Develop newest
          </button>
          <button
            type="button"
            className="atlas-vr-btn"
            onClick={() => {
              replayTrail();
            }}
            disabled={!hasTrail || trailOn}
          >
            Replay last outing
          </button>
          {hasCohort && developState === 'animating' && (
            <p className="atlas-vr-hint" aria-live="polite">
              Developing newest blocks…
            </p>
          )}
          {hasCohort && developState === 'done' && (
            <p className="atlas-vr-hint" aria-live="polite">
              Newest blocks developed
            </p>
          )}
          {trailOn && (
            <p className="atlas-vr-hint" aria-live="polite">
              Your outing&apos;s blocks, replayed — nearest-neighbour order, not a GPS trace
            </p>
          )}
        </div>

        {stops.length > 0 && (
          <div className="atlas-vr-scrub">
            <label className="atlas-vr-scrub-label" htmlFor="atlas-vr-scrub">
              {scrubLabel}
            </label>
            <input
              id="atlas-vr-scrub"
              className="atlas-vr-scrub-range"
              type="range"
              min={0}
              max={stops.length}
              step={1}
              value={effectiveScrubIndex}
              onChange={(e) => setScrubIndex(Number(e.target.value))}
              aria-label="Time-scrub the atlas to an earlier visit date"
            />
          </div>
        )}

        <div className="atlas-vr-vrrow">
          {xr.supported === true && !xr.active && (
            <button
              type="button"
              className="atlas-vr-btn atlas-vr-btn--primary"
              onClick={() => xr.enter('immersive-vr')}
            >
              Enter VR
            </button>
          )}
          {xr.supported === true && !xr.active && collected > 0 && (
            <p className="atlas-vr-hint">{VR_INVITE_HINT}</p>
          )}
          {xr.arSupported === true && !xr.active && (
            <button type="button" className="atlas-vr-btn" onClick={() => xr.enter('immersive-ar')}>
              Enter AR
            </button>
          )}
          {xr.active && (
            <button type="button" className="atlas-vr-btn atlas-vr-btn--primary" onClick={xr.exit}>
              {xr.mode === 'immersive-ar' ? 'Exit AR' : 'Exit VR'}
            </button>
          )}
          {xr.supported === false && (
            <p className="atlas-vr-hint">
              This device/browser has no immersive VR — the flat view above is the same scene.
            </p>
          )}
          {xr.supported === null && <p className="atlas-vr-hint">Checking for VR support…</p>}
          {xr.active && (
            <p className="atlas-vr-hint">
              Trigger selects a block; trigger on bare paper closes the vignette or turns the page.
              Grip on the table grabs it — release to set it down. Squeeze off-table replays the
              outing when a vignette is open, else goes back a page. A/B buttons step the time
              scrub.
            </p>
          )}
          {xr.status && <output className="atlas-vr-hint">{xr.status}</output>}
        </div>

        {cellHint && (
          <output className="atlas-vr-cellhint" aria-live="polite">
            {cellHint}
          </output>
        )}
        {error && (
          <p className="atlas-vr-error" role="alert">
            {error}
          </p>
        )}
        {notice && <output className="atlas-vr-notice">{notice}</output>}
      </section>
    </main>
  );
}
