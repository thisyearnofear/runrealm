import { ATLAS_VR_COLORS, ATLAS_VR_TABLE, type AtlasVrScene, type Rgb } from './atlas-vr-scene';

export interface AtlasVrView {
  projection: Float32Array;
  view: Float32Array;
  viewport: { x: number; y: number; width: number; height: number };
}

const MONO_FOV_DEG = 45;
const MONO_ELEVATION_DEG = 50;
const INSTANCE_STRIDE = 12;

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iOffset;
layout(location=3) in vec2 iScale;
layout(location=4) in vec3 iColor;
layout(location=5) in vec3 iEdge;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vColor;
out vec3 vEdge;
out vec3 vNormal;
void main() {
  vec3 world = iOffset + vec3(aPos.x * iScale.x, aPos.y * iScale.y, aPos.z * iScale.x);
  gl_Position = uViewProj * uModel * vec4(world, 1.0);
  vColor = iColor;
  vEdge = iEdge;
  vNormal = aNormal;
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec3 vColor;
in vec3 vEdge;
in vec3 vNormal;
uniform vec3 uLightDir;
uniform float uAmbient;
uniform int uMode;
uniform float uEdgeAlpha;
out vec4 frag;
void main() {
  if (uMode == 1) {
    frag = vec4(vEdge, uEdgeAlpha);
    return;
  }
  float diff = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  float lit = uAmbient + (1.0 - uAmbient) * diff;
  frag = vec4(vColor * lit, 1.0);
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

export class AtlasVrRenderer {
  static create(canvas: HTMLCanvasElement): AtlasVrRenderer | null {
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
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
  private instanceBuffer: WebGLBuffer | null = null;
  private instanceCount = 0;
  private prismVertCount = 0;
  private rimVertCount = 0;
  private uniforms: {
    viewProj: WebGLUniformLocation | null;
    model: WebGLUniformLocation | null;
    lightDir: WebGLUniformLocation | null;
    ambient: WebGLUniformLocation | null;
    mode: WebGLUniformLocation | null;
    edgeAlpha: WebGLUniformLocation | null;
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
    };

    const prism = buildPrism();
    this.prismVertCount = prism.positions.length / 3;
    const rim = buildRimLines();
    this.rimVertCount = rim.length / 3;

    this.instanceBuffer = gl.createBuffer();
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
    ];
    for (const [loc, size, offsetFloats] of attribs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offsetFloats * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
  }

  setScene(scene: AtlasVrScene): void {
    const gl = this.gl;
    const count = scene.cells.length + 1;
    const data = new Float32Array(count * INSTANCE_STRIDE);
    const t = scene.table;
    const disc: [number, number, number, number, number, Rgb, Rgb] = [
      t.center.x,
      t.topY - ATLAS_VR_TABLE.rimSlabHeight,
      t.center.z,
      t.radius * 1.06,
      ATLAS_VR_TABLE.rimSlabHeight,
      scaleRgb(ATLAS_VR_COLORS.blueprint, 1.5),
      scaleRgb(ATLAS_VR_COLORS.muted, 0.7),
    ];
    data[0] = disc[0];
    data[1] = disc[1];
    data[2] = disc[2];
    data[3] = disc[3];
    data[4] = disc[4];
    data[5] = disc[5][0];
    data[6] = disc[5][1];
    data[7] = disc[5][2];
    data[8] = disc[6][0];
    data[9] = disc[6][1];
    data[10] = disc[6][2];
    for (let i = 0; i < scene.cells.length; i += 1) {
      const cell = scene.cells[i];
      const o = (i + 1) * INSTANCE_STRIDE;
      data[o] = cell.position.x;
      data[o + 1] = cell.position.y;
      data[o + 2] = cell.position.z;
      data[o + 3] = scene.cellRadius;
      data[o + 4] = cell.height;
      data[o + 5] = cell.color[0];
      data[o + 6] = cell.color[1];
      data[o + 7] = cell.color[2];
      data[o + 8] = cell.edgeColor[0];
      data[o + 9] = cell.edgeColor[1];
      data[o + 10] = cell.edgeColor[2];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    this.instanceCount = count;
  }

  renderMono(width: number, height: number, model?: Float32Array): void {
    const aspect = height > 0 ? width / height : 1;
    const cam = monoCameraFit(aspect);
    const projection = mat4Perspective((MONO_FOV_DEG * Math.PI) / 180, aspect, 0.05, 50);
    const view = mat4LookAt(cam.eye, cam.target, [0, 0, -1]);
    this.drawViews(
      [{ projection, view, viewport: { x: 0, y: 0, width, height } }],
      model ?? mat4Identity()
    );
  }

  private bindProgram(program: WebGLProgram): void {
    this.gl.useProgram(program);
  }

  drawViews(views: AtlasVrView[], model: Float32Array): void {
    const gl = this.gl;
    if (!this.program || this.lost) return;
    this.bindProgram(this.program);
    const [cr, cg, cb] = this.clearColor;
    gl.clearColor(cr, cg, cb, 1);
    gl.uniformMatrix4fv(this.uniforms.model, false, model);
    gl.uniform3f(this.uniforms.lightDir, -0.35, 1.0, 0.45);
    gl.uniform1f(this.uniforms.ambient, 0.62);
    gl.uniform1f(this.uniforms.edgeAlpha, 0.85);
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
      gl.bindVertexArray(null);
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (this.vaoFill) gl.deleteVertexArray(this.vaoFill);
    if (this.vaoLine) gl.deleteVertexArray(this.vaoLine);
    if (this.instanceBuffer) gl.deleteBuffer(this.instanceBuffer);
    if (this.program) gl.deleteProgram(this.program);
    this.vaoFill = null;
    this.vaoLine = null;
    this.instanceBuffer = null;
    this.program = null;
  }
}
