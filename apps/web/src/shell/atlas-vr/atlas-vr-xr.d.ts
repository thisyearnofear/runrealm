type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';

type XRReferenceSpaceType =
  | 'viewer'
  | 'local'
  | 'local-floor'
  | 'bounded-floor'
  | 'unbounded';

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
}

interface XRSystem extends EventTarget {
  isSessionSupported(mode: XRSessionMode): Promise<boolean>;
  requestSession(mode: XRSessionMode, init?: XRSessionInit): Promise<XRSession>;
}

interface XRSession extends EventTarget {
  readonly inputSources: XRInputSourceArray;
  readonly renderState: { baseLayer?: XRWebGLLayer | null };
  requestReferenceSpace(type: XRReferenceSpaceType): Promise<XRReferenceSpace>;
  updateRenderState(state: { baseLayer?: XRWebGLLayer | null }): void;
  requestAnimationFrame(callback: XRFrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  end(): Promise<void>;
}

type XRFrameRequestCallback = (time: number, frame: XRFrame) => void;

interface XRSpace extends EventTarget {}

interface XRFrame {
  readonly session: XRSession;
  getViewerPose(space: XRReferenceSpace): XRViewerPose | null;
  getPose(space: XRSpace, baseSpace: XRSpace): XRPose | null;
}

interface XRReferenceSpace extends XRSpace {
  getOffsetReferenceSpace?(originOffset: XRRigidTransform): XRReferenceSpace;
}

interface XRPose {
  readonly transform: XRRigidTransform;
  readonly emulatedPosition?: boolean;
}

interface XRViewerPose {
  readonly views: readonly XRView[];
  readonly transform: XRRigidTransform;
}

interface XRView {
  readonly eye: 'left' | 'right' | 'none' | string;
  readonly projectionMatrix: Float32Array;
  readonly transform: XRRigidTransform;
}

interface XRRigidTransform {
  readonly matrix: Float32Array;
  readonly inverse: XRRigidTransform;
  readonly position: DOMPointReadOnly;
  readonly orientation: DOMPointReadOnly;
}

interface XRViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface XRWebGLLayer {
  readonly framebuffer: WebGLFramebuffer;
  readonly framebufferWidth: number;
  readonly framebufferHeight: number;
  getViewport(view: XRView): XRViewport | null;
}

declare var XRWebGLLayer: {
  prototype: XRWebGLLayer;
  new (
    session: XRSession,
    context: WebGLRenderingContext | WebGL2RenderingContext
  ): XRWebGLLayer;
};

interface XRInputSource {
  readonly handedness: 'none' | 'left' | 'right' | string;
  readonly targetRayMode: string;
  readonly targetRaySpace: XRSpace;
  readonly gripSpace?: XRSpace;
  readonly hand?: unknown;
  readonly gamepad?: Gamepad;
}

interface XRInputSourceEvent extends Event {
  readonly frame: XRFrame;
  readonly inputSource: XRInputSource;
}

interface XRInputSourceArray extends Iterable<XRInputSource> {
  readonly length: number;
  [index: number]: XRInputSource;
}

interface Navigator {
  readonly xr?: XRSystem;
}

interface WebGLRenderingContext {
  makeXRCompatible(): Promise<void>;
}

interface WebGL2RenderingContext {
  makeXRCompatible(): Promise<void>;
}
