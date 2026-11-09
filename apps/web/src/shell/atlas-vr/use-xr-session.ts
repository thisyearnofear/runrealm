import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type AtlasVrRenderer, type AtlasVrView, tableModelMatrix } from './atlas-vr-renderer';
import {
  ATLAS_VR_TABLE,
  type AtlasVrScene,
  type AtlasVrTablePose,
  intersectTableTop,
  pickCellAt,
  sceneSpaceRay,
  withinGrabDistance,
  worldPointToScene,
} from './atlas-vr-scene';

export type XrSessionMode = 'immersive-vr' | 'immersive-ar';

export interface UseXrSessionOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rendererRef: RefObject<AtlasVrRenderer | null>;
  getScene: () => AtlasVrScene | null;
  tablePoseRef: RefObject<AtlasVrTablePose>;
  vignetteOpenRef: RefObject<boolean>;
  onCyclePage: (delta: number) => void;
  onSelectCell: (cellId: string | null) => string | void;
  onScrubStep: (delta: number) => string | void;
  onReplay: () => string | void;
}

export interface UseXrSessionResult {
  supported: boolean | null;
  arSupported: boolean | null;
  active: boolean;
  mode: XrSessionMode | null;
  status: string | null;
  enter: (mode?: XrSessionMode) => void;
  exit: () => void;
}

interface SourcePose {
  origin: [number, number, number];
  dir: [number, number, number];
  grip?: [number, number, number];
}

interface GrabState {
  source: XRInputSource;
  startRayYaw: number;
  startTableYaw: number;
}

const SCRUB_BACK_BUTTON = 4;
const SCRUB_FWD_BUTTON = 5;

function rayFromMatrix(m: Float32Array): SourcePose {
  const dx = -m[8];
  const dy = -m[9];
  const dz = -m[10];
  const l = Math.hypot(dx, dy, dz) || 1;
  return {
    origin: [m[12], m[13], m[14]],
    dir: [dx / l, dy / l, dz / l],
  };
}

export function useXrSession({
  canvasRef,
  rendererRef,
  getScene,
  tablePoseRef,
  vignetteOpenRef,
  onCyclePage,
  onSelectCell,
  onScrubStep,
  onReplay,
}: UseXrSessionOptions): UseXrSessionResult {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [arSupported, setArSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<XrSessionMode | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const rafRef = useRef(0);
  const posesRef = useRef(new Map<XRInputSource, SourcePose>());
  const grabRef = useRef<GrabState | null>(null);
  const padPrevRef = useRef(new Map<XRInputSource, boolean[]>());
  const eyeYRef = useRef(0);
  const cbRef = useRef({ getScene, onCyclePage, onSelectCell, onScrubStep, onReplay });
  cbRef.current = { getScene, onCyclePage, onSelectCell, onScrubStep, onReplay };
  const tablePoseShared = tablePoseRef;
  const vignetteShared = vignetteOpenRef;

  useEffect(() => {
    const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
    if (!xr || typeof xr.isSessionSupported !== 'function') {
      setSupported(false);
      setArSupported(false);
      return;
    }
    let cancelled = false;
    xr.isSessionSupported('immersive-vr')
      .then((ok) => {
        if (!cancelled) setSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    xr.isSessionSupported('immersive-ar')
      .then((ok) => {
        if (!cancelled) setArSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setArSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const report = useCallback((result: string | void) => {
    if (typeof result === 'string' && result.length > 0) setStatus(result);
  }, []);

  const teardown = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    grabRef.current = null;
    posesRef.current.clear();
    padPrevRef.current.clear();
    if (session) {
      try {
        session.cancelAnimationFrame(rafRef.current);
        session.updateRenderState({ baseLayer: null });
      } catch {
        void 0;
      }
    }
    rafRef.current = 0;
    setActive(false);
    setMode(null);
  }, []);

  const enter = useCallback(
    (requested: XrSessionMode = 'immersive-vr') => {
      const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!xr) {
        setStatus('Immersive sessions are not available in this browser.');
        return;
      }
      if (!canvas || !renderer || !renderer.ready) {
        setStatus('The 3D view is not ready — session entry needs the WebGL scene running.');
        return;
      }
      setStatus(null);
      void (async () => {
        let session: XRSession;
        try {
          session = await xr.requestSession(requested, {
            optionalFeatures: ['local-floor', 'hand-tracking'],
          });
        } catch (error) {
          setStatus(
            `The headset did not start a session (${error instanceof Error ? error.message : String(error)}). The flat view keeps working.`
          );
          return;
        }
        if (sessionRef.current) {
          try {
            await session.end();
          } catch {
            void 0;
          }
          return;
        }
        sessionRef.current = session;
        (window as Window & { __atlasVrSession?: XRSession }).__atlasVrSession = session;
        const gl = renderer.gl;
        try {
          if (typeof gl.makeXRCompatible === 'function') await gl.makeXRCompatible();
          const layer = new XRWebGLLayer(session, gl);
          session.updateRenderState({ baseLayer: layer });
          let space: XRReferenceSpace;
          try {
            space = await session.requestReferenceSpace('local-floor');
          } catch {
            try {
              space = await session.requestReferenceSpace('local');
            } catch {
              space = await session.requestReferenceSpace('viewer');
            }
          }
          const poseFor = (source: XRInputSource): SourcePose | null =>
            posesRef.current.get(source) ?? null;
          const renderedPose = (): AtlasVrTablePose => ({
            ...tablePoseShared.current,
            dy: eyeYRef.current,
          });
          const tableHit = (source: XRInputSource) => {
            const scene = cbRef.current.getScene();
            const pose = poseFor(source);
            if (!scene || !pose) return null;
            const ray = sceneSpaceRay(pose.origin, pose.dir, renderedPose());
            return intersectTableTop(scene, ray.origin, ray.dir);
          };
          const startGrab = (source: XRInputSource) => {
            const pose = poseFor(source);
            grabRef.current = {
              source,
              startRayYaw: pose ? Math.atan2(pose.dir[0], pose.dir[2]) : 0,
              startTableYaw: tablePoseShared.current.yaw,
            };
            setStatus('Table grabbed — release grip to set it down.');
          };
          const releaseGrab = (source: XRInputSource) => {
            if (grabRef.current?.source === source) {
              grabRef.current = null;
              setStatus(null);
            }
          };
          const onSelect = (event: Event) => {
            (window as Window & { __atlasVrSelectFired?: boolean }).__atlasVrSelectFired = true;
            const e = event as XRInputSourceEvent;
            const source = e.inputSource;
            const scene = cbRef.current.getScene();
            const pose = poseFor(source);
            if (source.hand && scene && pose) {
              const point = worldPointToScene(pose.origin, renderedPose());
              if (withinGrabDistance(scene, point)) {
                startGrab(source);
                return;
              }
            }
            const hit = source.hand ? null : tableHit(source);
            if (hit && scene) {
              const cell = pickCellAt(scene, hit.x, hit.z);
              report(cbRef.current.onSelectCell(cell ? cell.cellId : null));
              return;
            }
            report(cbRef.current.onSelectCell(null));
          };
          const onSelectEnd = (event: Event) => {
            releaseGrab((event as XRInputSourceEvent).inputSource);
          };
          const onSqueeze = (event: Event) => {
            (window as Window & { __atlasVrSqueezeFired?: boolean }).__atlasVrSqueezeFired = true;
            const e = event as XRInputSourceEvent;
            if (tableHit(e.inputSource)) {
              startGrab(e.inputSource);
              return;
            }
            if (vignetteShared.current) {
              report(cbRef.current.onReplay());
              return;
            }
            cbRef.current.onCyclePage(-1);
          };
          const onSqueezeEnd = (event: Event) => {
            releaseGrab((event as XRInputSourceEvent).inputSource);
          };
          session.addEventListener('selectstart', onSelect);
          session.addEventListener('selectend', onSelectEnd);
          session.addEventListener('squeezestart', onSqueeze);
          session.addEventListener('squeezeend', onSqueezeEnd);
          session.addEventListener('end', teardown);
          const stepGamepads = () => {
            for (const source of session.inputSources) {
              const pad = source.gamepad;
              if (!pad) continue;
              const prev = padPrevRef.current.get(source) ?? [];
              const next = pad.buttons.map((b) => b.pressed);
              const pressed = (i: number) => next[i] && !prev[i];
              if (pressed(SCRUB_BACK_BUTTON)) report(cbRef.current.onScrubStep(-1));
              if (pressed(SCRUB_FWD_BUTTON)) report(cbRef.current.onScrubStep(1));
              padPrevRef.current.set(source, next);
            }
          };
          const onFrame = (_time: number, frame: XRFrame) => {
            const w = window as Window & { __atlasVrFrameCount?: number };
            w.__atlasVrFrameCount = (w.__atlasVrFrameCount ?? 0) + 1;
            const current = sessionRef.current;
            if (!current) return;
            rafRef.current = current.requestAnimationFrame(onFrame);
            const pose = frame.getViewerPose(space);
            if (!pose || !rendererRef.current) return;
            for (const source of current.inputSources) {
              const rayPose = frame.getPose(source.targetRaySpace, space);
              if (!rayPose) continue;
              const sp = rayFromMatrix(rayPose.transform.matrix);
              if (source.gripSpace) {
                const gripPose = frame.getPose(source.gripSpace, space);
                if (gripPose) {
                  sp.grip = [
                    gripPose.transform.matrix[12],
                    gripPose.transform.matrix[13],
                    gripPose.transform.matrix[14],
                  ];
                }
              }
              posesRef.current.set(source, sp);
            }
            stepGamepads();
            const grab = grabRef.current;
            if (grab) {
              const sp = posesRef.current.get(grab.source);
              if (sp) {
                const hand = sp.grip ?? sp.origin;
                const rayYaw = Math.atan2(sp.dir[0], sp.dir[2]);
                const currentPose = tablePoseShared.current;
                tablePoseShared.current = {
                  dx: hand[0] - ATLAS_VR_TABLE.center.x,
                  dz: hand[2] - ATLAS_VR_TABLE.center.z,
                  yaw: grab.startTableYaw + (rayYaw - grab.startRayYaw),
                  dy: currentPose.dy,
                };
              }
            }
            const layerNow = current.renderState.baseLayer;
            if (!layerNow) return;
            const glCtx = rendererRef.current.gl;
            glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, layerNow.framebuffer);
            const views: AtlasVrView[] = [];
            for (const view of pose.views) {
              const vp = layerNow.getViewport(view);
              if (!vp) continue;
              views.push({
                projection: view.projectionMatrix,
                view: view.transform.inverse.matrix,
                viewport: { x: vp.x, y: vp.y, width: vp.width, height: vp.height },
              });
            }
            const eyeY = pose.transform.position.y;
            eyeYRef.current = eyeY;
            const tablePose = tablePoseShared.current;
            rendererRef.current.drawViews(views, tableModelMatrix({ ...tablePose, dy: eyeY }), {
              clearAlpha: requested === 'immersive-ar' ? 0 : 1,
            });
          };
          rafRef.current = session.requestAnimationFrame(onFrame);
          setMode(requested);
          setActive(true);
        } catch (error) {
          sessionRef.current = null;
          try {
            await session.end();
          } catch {
            void 0;
          }
          setStatus(
            `The session could not attach to the canvas (${error instanceof Error ? error.message : String(error)}). The flat view keeps working.`
          );
        }
      })();
    },
    [canvasRef, rendererRef, teardown, tablePoseShared, vignetteShared, report]
  );

  const exit = useCallback(() => {
    const session = sessionRef.current;
    if (session) {
      void session.end().catch(() => undefined);
    }
    teardown();
  }, [teardown]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (session) void session.end().catch(() => undefined);
      teardown();
    };
  }, [teardown]);

  return { supported, arSupported, active, mode, status, enter, exit };
}
