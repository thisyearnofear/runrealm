'use client';

import {
  ATLAS_STORAGE_KEY,
  isNeighbourhoodAtlas,
  type NeighbourhoodAtlas,
} from '@runrealm/shared-core/types/neighbourhood';
import {
  ATLAS_BACKUP_MAX_BYTES,
  AtlasBackupError,
  parseAtlasBackup,
} from '@runrealm/shared-core/utils/atlas-backup';
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtlasVrRenderer } from '../../shell/atlas-vr/atlas-vr-renderer';
import { buildAtlasVrScene, clampPageIndex } from '../../shell/atlas-vr/atlas-vr-scene';
import { createDemoAtlas, DEMO_ATLAS_LABEL } from '../../shell/atlas-vr/demo-atlas';
import { useXrSession } from '../../shell/atlas-vr/use-xr-session';

type AtlasSource = 'demo' | 'device' | 'file';

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

export default function AtlasVrClient() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AtlasVrRenderer | null>(null);
  const [atlas, setAtlas] = useState<NeighbourhoodAtlas>(() => createDemoAtlas());
  const [source, setSource] = useState<AtlasSource>('demo');
  const [pageIndex, setPageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const atlasRef = useRef(atlas);
  atlasRef.current = atlas;

  const cyclePage = useCallback((delta: number) => {
    setPageIndex((p) => clampPageIndex(atlasRef.current, p + delta));
  }, []);

  const xr = useXrSession({ canvasRef, rendererRef, onCyclePage: cyclePage });
  const xrActiveRef = useRef(false);
  xrActiveRef.current = xr.active;

  const scene = useMemo(() => buildAtlasVrScene(atlas, pageIndex), [atlas, pageIndex]);

  useEffect(() => {
    document.body.classList.add('atlas-vr-route');
    const stored = readDeviceAtlas();
    if (stored) {
      setAtlas(stored);
      setSource('device');
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
    const loop = () => {
      raf = window.requestAnimationFrame(loop);
      const r = rendererRef.current;
      if (!r || xrActiveRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      r.renderMono(canvas.width, canvas.height);
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
    rendererRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') cyclePage(1);
      else if (event.key === 'ArrowLeft') cyclePage(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cyclePage]);

  const loadDevice = useCallback(() => {
    const stored = readDeviceAtlas();
    if (!stored) {
      setNotice(null);
      setError('No atlas is stored on this device yet. Try the demo atlas or a backup file.');
      return;
    }
    setAtlas(stored);
    setSource('device');
    setPageIndex(0);
    setError(null);
    setNotice("Loaded this device's atlas.");
  }, []);

  const loadDemo = useCallback(() => {
    setAtlas(createDemoAtlas());
    setSource('demo');
    setPageIndex(0);
    setError(null);
    setNotice(null);
  }, []);

  const onFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
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
        setPageIndex(0);
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
  }, []);

  const pageCount = scene.pageCount;
  const shownPage = scene.pageIndex + 1;
  const collected = scene.cells.filter((c) => c.visits > 0 || c.anchor).length;

  return (
    <main className="atlas-vr-page" aria-labelledby="atlas-vr-title">
      <header className="atlas-vr-header">
        <p className="atlas-vr-kicker">RunRealm · WebXR prototype</p>
        <h1 id="atlas-vr-title">Atlas VR</h1>
        <p className="atlas-vr-sub">
          Your neighbourhood atlas as a physical map table — blueprint paper, chalk edges, verdigris
          blocks raised by every outing. The flat view below is the same scene the headset gets.
        </p>
      </header>

      <section className="atlas-vr-stage" aria-label="Atlas scene preview">
        <canvas
          ref={canvasRef}
          className="atlas-vr-canvas"
          role="img"
          aria-label="Three-dimensional preview of the neighbourhood atlas"
        />
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

        <div className="atlas-vr-vrrow">
          {xr.supported === true && !xr.active && (
            <button type="button" className="atlas-vr-btn atlas-vr-btn--primary" onClick={xr.enter}>
              Enter VR
            </button>
          )}
          {xr.active && (
            <button type="button" className="atlas-vr-btn atlas-vr-btn--primary" onClick={xr.exit}>
              Exit VR
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
              Trigger/select turns to the next neighbourhood; squeeze goes back.
            </p>
          )}
          {xr.status && <output className="atlas-vr-hint">{xr.status}</output>}
        </div>

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
