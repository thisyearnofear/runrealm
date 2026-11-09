import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type AtlasVrRenderer, type AtlasVrView, mat4Translation } from './atlas-vr-renderer';

export interface UseXrSessionOptions {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  rendererRef: RefObject<AtlasVrRenderer | null>;
  onCyclePage: (delta: number) => void;
}

export interface UseXrSessionResult {
  supported: boolean | null;
  active: boolean;
  status: string | null;
  enter: () => void;
  exit: () => void;
}

export function useXrSession({
  canvasRef,
  rendererRef,
  onCyclePage,
}: UseXrSessionOptions): UseXrSessionResult {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const rafRef = useRef(0);
  const cycleRef = useRef(onCyclePage);
  useEffect(() => {
    cycleRef.current = onCyclePage;
  }, [onCyclePage]);

  useEffect(() => {
    const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
    if (!xr || typeof xr.isSessionSupported !== 'function') {
      setSupported(false);
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
    return () => {
      cancelled = true;
    };
  }, []);

  const teardown = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
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
  }, []);

  const enter = useCallback(() => {
    const xr = typeof navigator !== 'undefined' ? navigator.xr : undefined;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!xr) {
      setStatus('Immersive VR is not available in this browser.');
      return;
    }
    if (!canvas || !renderer || !renderer.ready) {
      setStatus('The 3D view is not ready — VR entry needs the WebGL scene running.');
      return;
    }
    setStatus(null);
    void (async () => {
      let session: XRSession;
      try {
        session = await xr.requestSession('immersive-vr', {
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
        const onSelect = () => cycleRef.current(1);
        const onSqueeze = () => cycleRef.current(-1);
        session.addEventListener('selectstart', onSelect);
        session.addEventListener('squeezestart', onSqueeze);
        session.addEventListener('end', teardown);
        const onFrame = (_time: number, frame: XRFrame) => {
          const current = sessionRef.current;
          if (!current) return;
          rafRef.current = current.requestAnimationFrame(onFrame);
          const pose = frame.getViewerPose(space);
          if (!pose || !rendererRef.current) return;
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
          rendererRef.current.drawViews(views, mat4Translation(0, eyeY, 0));
        };
        rafRef.current = session.requestAnimationFrame(onFrame);
        setActive(true);
      } catch (error) {
        sessionRef.current = null;
        try {
          await session.end();
        } catch {
          void 0;
        }
        setStatus(
          `The VR session could not attach to the canvas (${error instanceof Error ? error.message : String(error)}). The flat view keeps working.`
        );
      }
    })();
  }, [canvasRef, rendererRef, teardown]);

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

  return { supported, active, status, enter, exit };
}
