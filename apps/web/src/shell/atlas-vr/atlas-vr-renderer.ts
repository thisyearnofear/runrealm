import {
  ATLAS_VR_COLORS,
  ATLAS_VR_TABLE,
  type AtlasVrCellInstance,
  type AtlasVrScene,
  type AtlasVrTablePose,
  type Rgb,
  type Vec3,
} from './atlas-vr-scene';

export interface AtlasVrView {
  projection: Float32Array;
  view: Float32Array;
  viewport: { x: number; y: number; width: number; height: number };
}

export interface AtlasVrMonoView {
  azimuth: number;
  elevation: number;
  distance: number;
  target: [number, number, number];
}

const MONO_FOV_DEG = 45;
const MONO_ELEVATION_DEG = 50;
const INSTANCE_STRIDE = 14;
const TRAIL_TAIL_FRACTION = 0.22;
const TRAIL_HALF_WIDTH = 0.005;

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iOffset;
layout(location=3) in vec2 iScale;
layout(location=4) in vec3 iColor;
layout(location=5) in vec3 iEdge;
layout(location=6) in float iDevelop;
layout(location=7) in float iDim;
layout(location=8) in float iLift;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vEdge;
out vec3 vNormal;
out vec3 vWorld;
out vec3 vDyn;
void main() {
  vec3 world = iOffset + vec3(aPos.x * iScale.x, aPos.y * iScale.y, aPos.z * iScale.x);
  gl_Position = uViewProj * uModel * vec4(world, 1.0);
  vColor = iColor;
  vEdge = iEdge;
  vNormal = aNormal;
  vWorld = world;
  vDyn = vec3(iDevelop, iDim, iLift);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vColor;
in vec3 vEdge;
in vec3 vNormal;
in vec3 vWorld;
in vec3 vDyn;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform int uMode;
uniform float uEdgeAlpha;
uniform vec3 uChalk;
uniform vec3 uTrailColor;
uniform float uTrailAlpha;
out vec4 frag;
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main() {
  if (uMode == 1) {
    vec3 e = vEdge * (1.0 + vDyn.z * 1.4);
    float a = uEdgeAlpha;
    if (vDyn.y > 0.5) {
      e = mix(e, uChalk, 0.35);
      a *= 0.45;
    }
    frag = vec4(e, a);
    return;
  }
  if (uMode == 2) {
    frag = vec4(uTrailColor, uTrailAlpha);
    return;
  }
  vec3 col = vColor;
  if (vNormal.y > 0.5) {
    float grain = (hash21(vWorld.xz * 900.0) - 0.5) * 0.07;
    if (vDyn.x < 0.999) {
      float n = hash21(floor(vWorld.xz * 420.0));
      float edge = vDyn.x * 1.35 - 0.175;
      float on = smoothstep(n - 0.1, n + 0.1, edge);
      col = mix(uChalk * 0.96, col, on);
    }
    col += grain;
  }
  if (vDyn.y > 0.5) col = col * 0.38 + vec3(0.015, 0.045, 0.07);
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  float lit = uAmbient + (1.0 - uAmbient) * diff;
  frag = vec4(col * lit, 1.0);
}`;

export function mat4Identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

export function mat4Translation(x: number, y: number, z: number): Float32Array {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mat4RotationY(rad: number): Float32Array {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

export function mat4Perspective(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number
): Float32Array {
  const f = 1 / Math.tan(fovYRad / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function mat4LookAt(
  eye: readonly [number, number, number],
  target: readonly [number, number, number],
  up: readonly [number, number, number]
): Float32Array {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = yx;
  m[2] = zx;
  m[4] = xy;
  m[5] = yy;
  m[6] = zy;
  m[8] = xz;
  m[9] = yz;
  m[10] = zz;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

function hexCorners(): Array<[number, number]> {
  const corners: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    corners.push([Math.cos(angle), Math.sin(angle)]);
  }
  return corners;
}

function buildPrism(): { positions: Float32Array; normals: Float32Array } {
  const corners = hexCorners();
  const pos: number[] = [];
  const nrm: number[] = [];
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
  };
  for (let i = 0; i < 6; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 6];
    const midAngle = (Math.PI / 3) * i + Math.PI / 6 + Math.PI / 6;
    const nx = Math.cos(midAngle);
    const nz = Math.sin(midAngle);
    push(ax, 0, az, nx, 0, nz);
    push(bx, 0, bz, nx, 0, nz);
    push(bx, 1, bz, nx, 0, nz);
    push(ax, 0, az, nx, 0, nz);
    push(bx, 1, bz, nx, 0, nz);
    push(ax, 1, az, nx, 0, nz);
  }
  for (let i = 0; i < 6; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 6];
    push(0, 1, 0, 0, 1, 0);
    push(ax, 1, az, 0, 1, 0);
    push(bx, 1, bz, 0, 1, 0);
  }
  for (let i = 0; i < 6; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 6];
    push(0, 0, 0, 0, -1, 0);
    push(bx, 0, bz, 0, -1, 0);
    push(ax, 0, az, 0, -1, 0);
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm) };
}

function buildRimLines(): Float32Array {
  const corners = hexCorners();
  const pos: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 6];
    pos.push(ax, 1, az, bx, 1, bz);
  }
  return new Float32Array(pos);
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function scaleRgb(color: Rgb, factor: number): [number, number, number] {
  return [
    Math.min(1, color[0] * factor),
    Math.min(1, color[1] * factor),
    Math.min(1, color[2] * factor),
  ];
}

export function monoCameraFit(
  aspect: number,
  tableRadius = ATLAS_VR_TABLE.diameter / 2
): { eye: [number, number, number]; target: [number, number, number] } {
  const c = ATLAS_VR_TABLE.center;
  const halfV = (MONO_FOV_DEG * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * Math.min(Math.max(aspect, 0.1), 1));
  const fitHalf = Math.min(halfV, halfH);
  const dist = (tableRadius * 1.6) / Math.tan(fitHalf);
  const elev = (MONO_ELEVATION_DEG * Math.PI) / 180;
  return {
    eye: [c.x, c.y + Math.sin(elev) * dist, c.z + Math.cos(elev) * dist],
    target: [c.x, c.y, c.z],
  };
}

export function monoViewFit(aspect: number): AtlasVrMonoView {
  const fit = monoCameraFit(aspect);
  const dx = fit.eye[0] - fit.target[0];
  const dy = fit.eye[1] - fit.target[1];
  const dz = fit.eye[2] - fit.target[2];
  const distance = Math.hypot(dx, dy, dz) || 1;
  return {
    azimuth: Math.atan2(dx, dz),
    elevation: Math.asin(dy / distance),
    distance,
    target: [...fit.target],
  };
}

export function monoViewEye(view: AtlasVrMonoView): [number, number, number] {
  const ce = Math.cos(view.elevation);
  return [
    view.target[0] + view.distance * ce * Math.sin(view.azimuth),
    view.target[1] + view.distance * Math.sin(view.elevation),
    view.target[2] + view.distance * ce * Math.cos(view.azimuth),
  ];
}

export function monoPickRay(
  view: AtlasVrMonoView,
  ndcX: number,
  ndcY: number,
  aspect: number
): { origin: Vec3; dir: Vec3 } {
  const eye = monoViewEye(view);
  const up: Vec3 = [0, 0, -1];
  let fx = view.target[0] - eye[0];
  let fy = view.target[1] - eye[1];
  let fz = view.target[2] - eye[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  const zx = -fx;
  const zy = -fy;
  const zz = -fz;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const tanH = Math.tan((MONO_FOV_DEG * Math.PI) / 360);
  const px = ndcX * tanH * aspect;
  const py = ndcY * tanH;
  let dx = xx * px + yx * py + fx;
  let dy = xy * px + yy * py + fy;
  let dz = xz * px + yz * py + fz;
  const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  return { origin: eye, dir: [dx, dy, dz] };
}

export function tableModelMatrix(pose: AtlasVrTablePose): Float32Array {
  const c = ATLAS_VR_TABLE.center;
  return mat4Multiply(
    mat4Translation(0, pose.dy, 0),
    mat4Multiply(
      mat4Translation(pose.dx, 0, pose.dz),
      mat4Multiply(
        mat4Translation(c.x, c.y, c.z),
        mat4Multiply(mat4RotationY(pose.yaw), mat4Translation(-c.x, -c.y, -c.z))
      )
    )
  );
}

export class AtlasVrRenderer {
  static create(canvas: HTMLCanvasElement): AtlasVrRenderer | null {
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        xrCompatible: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) return null;
      return new AtlasVrRenderer(gl);
    } catch {
      return null;
    }
  }

  readonly gl: WebGL2RenderingContext;

  private program: WebGLProgram | null = null;
  private vaoFill: WebGLVertexArrayObject | null = null;
  private vaoLine: WebGLVertexArrayObject | null = null;
  private vaoTrail: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private trailBuffer: WebGLBuffer | null = null;
  private instanceData: Float32Array = new Float32Array(0);
  private instanceCount = 0;
  private trailSampleCount = 0;
  private trailProgress = 0;
  private trailHoldMs = 0;
  private prismVertCount = 0;
  private rimVertCount = 0;
  private uniforms: {
    viewProj: WebGLUniformLocation | null;
    model: WebGLUniformLocation | null;
    lightDir: WebGLUniformLocation | null;
    ambient: WebGLUniformLocation | null;
    mode: WebGLUniformLocation | null;
    edgeAlpha: WebGLUniformLocation | null;
    chalk: WebGLUniformLocation | null;
    trailColor: WebGLUniformLocation | null;
    trailAlpha: WebGLUniformLocation | null;
  };
  private clearColor: [number, number, number];
  private lost = false;

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.uniforms = {
      viewProj: null,
      model: null,
      lightDir: null,
      ambient: null,
      mode: null,
      edgeAlpha: null,
      chalk: null,
      trailColor: null,
      trailAlpha: null,
    };
    this.clearColor = scaleRgb(ATLAS_VR_COLORS.blueprint, 0.55);
    try {
      this.init();
    } catch {
      this.program = null;
    }
    const canvas = gl.canvas;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      try {
        this.init();
      } catch {
        this.program = null;
      }
    });
  }

  get ready(): boolean {
    return this.program !== null && !this.lost;
  }

  get trailActive(): boolean {
    return this.trailSampleCount > 0;
  }

  private init(): void {
    const gl = this.gl;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) throw new Error('shader compile failed');
    const program = gl.createProgram();
    if (!program) throw new Error('program create failed');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      throw new Error('program link failed');
    }
    this.program = program;
    this.uniforms = {
      viewProj: gl.getUniformLocation(program, 'uViewProj'),
      model: gl.getUniformLocation(program, 'uModel'),
      lightDir: gl.getUniformLocation(program, 'uLightDir'),
      ambient: gl.getUniformLocation(program, 'uAmbient'),
      mode: gl.getUniformLocation(program, 'uMode'),
      edgeAlpha: gl.getUniformLocation(program, 'uEdgeAlpha'),
      chalk: gl.getUniformLocation(program, 'uChalk'),
      trailColor: gl.getUniformLocation(program, 'uTrailColor'),
      trailAlpha: gl.getUniformLocation(program, 'uTrailAlpha'),
    };

    const prism = buildPrism();
    this.prismVertCount = prism.positions.length / 3;
    const rim = buildRimLines();
    this.rimVertCount = rim.length / 3;

    this.instanceBuffer = gl.createBuffer();
    this.trailBuffer = gl.createBuffer();
    const stride = INSTANCE_STRIDE * 4;

    this.vaoFill = gl.createVertexArray();
    gl.bindVertexArray(this.vaoFill);
    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, prism.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nrmBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, prism.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    this.bindInstanceAttribs(gl, stride);
    gl.bindVertexArray(null);

    this.vaoLine = gl.createVertexArray();
    gl.bindVertexArray(this.vaoLine);
    const rimBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rimBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rim, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    this.bindInstanceAttribs(gl, stride);
    gl.bindVertexArray(null);

    this.vaoTrail = gl.createVertexArray();
    gl.bindVertexArray(this.vaoTrail);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttrib3f(1, 0, 1, 0);
    gl.vertexAttrib3f(2, 0, 0, 0);
    gl.vertexAttrib2f(3, 1, 1);
    gl.vertexAttrib3f(4, 0, 0, 0);
    gl.vertexAttrib3f(5, 0, 0, 0);
    gl.vertexAttrib1f(6, 1);
    gl.vertexAttrib1f(7, 0);
    gl.vertexAttrib1f(8, 0);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private bindInstanceAttribs(gl: WebGL2RenderingContext, stride: number): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const attribs: Array<[number, number, number]> = [
      [2, 3, 0],
      [3, 2, 3],
      [4, 3, 5],
      [5, 3, 8],
      [6, 1, 11],
      [7, 1, 12],
      [8, 1, 13],
    ];
    for (const [loc, size, offsetFloats] of attribs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offsetFloats * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
  }

  private writeCellInstance(
    data: Float32Array,
    slot: number,
    cell: AtlasVrCellInstance,
    cellRadius: number
  ): void {
    const o = slot * INSTANCE_STRIDE;
    data[o] = cell.position.x;
    data[o + 1] = cell.position.y;
    data[o + 2] = cell.position.z;
    data[o + 3] = cellRadius;
    data[o + 4] = cell.height * (1 + cell.lift * 2);
    data[o + 5] = cell.color[0];
    data[o + 6] = cell.color[1];
    data[o + 7] = cell.color[2];
    data[o + 8] = cell.edgeColor[0];
    data[o + 9] = cell.edgeColor[1];
    data[o + 10] = cell.edgeColor[2];
    data[o + 11] = cell.develop;
    data[o + 12] = cell.dimmed ? 1 : 0;
    data[o + 13] = cell.lift;
  }

  setScene(scene: AtlasVrScene): void {
    const gl = this.gl;
    const count = scene.cells.length + 1;
    if (this.instanceData.length !== count * INSTANCE_STRIDE) {
      this.instanceData = new Float32Array(count * INSTANCE_STRIDE);
    }
    const data = this.instanceData;
    const t = scene.table;
    data[0] = t.center.x;
    data[1] = t.topY - ATLAS_VR_TABLE.rimSlabHeight;
    data[2] = t.center.z;
    data[3] = t.radius * 1.06;
    data[4] = ATLAS_VR_TABLE.rimSlabHeight;
    data[5] = scaleRgb(ATLAS_VR_COLORS.blueprint, 1.5)[0];
    data[6] = scaleRgb(ATLAS_VR_COLORS.blueprint, 1.5)[1];
    data[7] = scaleRgb(ATLAS_VR_COLORS.blueprint, 1.5)[2];
    data[8] = scaleRgb(ATLAS_VR_COLORS.muted, 0.7)[0];
    data[9] = scaleRgb(ATLAS_VR_COLORS.muted, 0.7)[1];
    data[10] = scaleRgb(ATLAS_VR_COLORS.muted, 0.7)[2];
    data[11] = 1;
    data[12] = 0;
    data[13] = 0;
    for (let i = 0; i < scene.cells.length; i += 1) {
      this.writeCellInstance(data, i + 1, scene.cells[i], scene.cellRadius);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.instanceCount = count;
  }

  updateCellInstance(index: number, cell: AtlasVrCellInstance, cellRadius: number): void {
    const slot = index + 1;
    if ((slot + 1) * INSTANCE_STRIDE > this.instanceData.length) return;
    this.writeCellInstance(this.instanceData, slot, cell, cellRadius);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      slot * INSTANCE_STRIDE * 4,
      this.instanceData,
      slot * INSTANCE_STRIDE,
      INSTANCE_STRIDE
    );
  }

  setTrailPath(vertices: Float32Array): void {
    const gl = this.gl;
    const samples = vertices.length / 3;
    this.trailSampleCount = samples;
    this.trailProgress = 0;
    this.trailHoldMs = 0;
    if (samples < 2) {
      this.clearTrail();
      return;
    }
    const ribbon = new Float32Array(samples * 2 * 3);
    for (let i = 0; i < samples; i += 1) {
      const prev = i > 0 ? i - 1 : 0;
      const next = i < samples - 1 ? i + 1 : samples - 1;
      let dx = vertices[next * 3] - vertices[prev * 3];
      let dz = vertices[next * 3 + 2] - vertices[prev * 3 + 2];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const px = -dz * TRAIL_HALF_WIDTH;
      const pz = dx * TRAIL_HALF_WIDTH;
      const o = i * 6;
      ribbon[o] = vertices[i * 3] + px;
      ribbon[o + 1] = vertices[i * 3 + 1];
      ribbon[o + 2] = vertices[i * 3 + 2] + pz;
      ribbon[o + 3] = vertices[i * 3] - px;
      ribbon[o + 4] = vertices[i * 3 + 1];
      ribbon[o + 5] = vertices[i * 3 + 2] - pz;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ribbon, gl.DYNAMIC_DRAW);
  }

  setTrailProgress(progress: number, holdMs = 0): void {
    this.trailProgress = Math.max(0, Math.min(1, progress));
    this.trailHoldMs = Math.max(0, holdMs);
  }

  clearTrail(): void {
    this.trailSampleCount = 0;
    this.trailProgress = 0;
    this.trailHoldMs = 0;
  }

  renderMono(width: number, height: number, view?: AtlasVrMonoView): void {
    const aspect = height > 0 ? width / height : 1;
    const cam = view ?? monoViewFit(aspect);
    const eye = monoViewEye(cam);
    const projection = mat4Perspective((MONO_FOV_DEG * Math.PI) / 180, aspect, 0.05, 50);
    const viewM = mat4LookAt(eye, cam.target, [0, 0, -1]);
    this.drawViews(
      [{ projection, view: viewM, viewport: { x: 0, y: 0, width, height } }],
      mat4Identity(),
      { clearAlpha: 1 }
    );
  }

  private bindProgram(program: WebGLProgram): void {
    this.gl.useProgram(program);
  }

  drawViews(views: AtlasVrView[], model: Float32Array, opts?: { clearAlpha?: number }): void {
    const gl = this.gl;
    if (!this.program || this.lost) return;
    this.bindProgram(this.program);
    const [cr, cg, cb] = this.clearColor;
    const clearAlpha = opts?.clearAlpha ?? 1;
    gl.clearColor(cr, cg, cb, clearAlpha);
    gl.uniformMatrix4fv(this.uniforms.model, false, model);
    gl.uniform3f(this.uniforms.lightDir, -0.35, 1.0, 0.45);
    gl.uniform1f(this.uniforms.ambient, 0.62);
    gl.uniform1f(this.uniforms.edgeAlpha, 0.85);
    gl.uniform3f(
      this.uniforms.chalk,
      ATLAS_VR_COLORS.chalk[0],
      ATLAS_VR_COLORS.chalk[1],
      ATLAS_VR_COLORS.chalk[2]
    );
    gl.uniform3f(this.uniforms.trailColor, 0.98, 0.96, 0.88);
    const holdFade = this.trailHoldMs > 0 ? Math.max(0, 1 - this.trailHoldMs / 1800) : 1;
    for (const v of views) {
      gl.viewport(v.viewport.x, v.viewport.y, v.viewport.width, v.viewport.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const viewProj = mat4Multiply(v.projection, v.view);
      gl.uniformMatrix4fv(this.uniforms.viewProj, false, viewProj);
      gl.uniform1i(this.uniforms.mode, 0);
      gl.bindVertexArray(this.vaoFill);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, this.prismVertCount, this.instanceCount);
      gl.uniform1i(this.uniforms.mode, 1);
      gl.bindVertexArray(this.vaoLine);
      gl.lineWidth(1);
      gl.drawArraysInstanced(gl.LINES, 0, this.rimVertCount, this.instanceCount);
      if (this.trailSampleCount > 1 && holdFade > 0) {
        const head = Math.max(2, Math.floor(this.trailProgress * (this.trailSampleCount - 1)) + 1);
        const tail = Math.max(
          0,
          head - Math.max(2, Math.floor(this.trailSampleCount * TRAIL_TAIL_FRACTION))
        );
        gl.depthMask(false);
        gl.uniform1i(this.uniforms.mode, 2);
        gl.bindVertexArray(this.vaoTrail);
        gl.uniform1f(this.uniforms.trailAlpha, 0.3 * holdFade);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, Math.min(head * 2, this.trailSampleCount * 2));
        gl.uniform1f(this.uniforms.trailAlpha, 0.95 * holdFade);
        gl.drawArrays(
          gl.TRIANGLE_STRIP,
          tail * 2,
          Math.min(head * 2, this.trailSampleCount * 2) - tail * 2
        );
        gl.bindVertexArray(null);
        gl.depthMask(true);
      }
      gl.bindVertexArray(null);
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (this.vaoFill) gl.deleteVertexArray(this.vaoFill);
    if (this.vaoLine) gl.deleteVertexArray(this.vaoLine);
    if (this.vaoTrail) gl.deleteVertexArray(this.vaoTrail);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    if (this.trailBuffer) gl.deleteBuffer(this.trailBuffer);
    if (this.program) gl.deleteProgram(this.program);
    this.vaoFill = null;
    this.vaoLine = null;
    this.vaoTrail = null;
    this.instanceBuffer = null;
    this.trailBuffer = null;
    this.program = null;
  }
}
