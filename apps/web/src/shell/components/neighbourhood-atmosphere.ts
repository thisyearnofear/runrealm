import { cellToPolygon } from '@runrealm/shared-core/utils/h3-territory';
import { SUNPRINT_ATLAS_COLORS as C } from '@runrealm/shared-core/utils/sunprint-atlas';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { prefersReducedMotion } from './cell-transition-scheduler';

interface TrailPoint {
  lng: number;
  lat: number;
  at: number;
}

interface GlowCell {
  id: string;
  /** 0..1 — visits deepened; drives glow strength. */
  strength: number;
}

interface Ripple {
  lng: number;
  lat: number;
  at: number;
  big: boolean;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
}

const TRAIL_MAX_AGE_MS = 90_000;
const TRAIL_MAX_POINTS = 160;
const TRAIL_MIN_STEP_M = 6;
const MAX_GLOWS = 40;
const MAX_RIPPLES = 24;
const MOTES = 26;
const DPR_CAP = 1.5;

function centroidOf(cellId: string): { lng: number; lat: number } | null {
  const ring = cellToPolygon(cellId).coordinates[0];
  if (!ring?.length) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return { lng: lng / ring.length, lat: lat / ring.length };
}

function distM(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * The atlas's ambient layer — one canvas above the basemap, below the DOM
 * markers. Everything here is transient light: drifting motes, slow sun
 * shafts, soft glows on ledger ground, the runner's fading chalk trail,
 * claim ripples, and halos around the runner seal and ghost wisp. The
 * ledger stays authoritative — this only makes the picture feel inhabited.
 */
export class NeighbourhoodAtmosphere {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: MaplibreMap;
  private raf = 0;
  private running = false;
  private destroyed = false;

  private cells: GlowCell[] = [];
  private centroids = new Map<string, { lng: number; lat: number }>();
  private trail: TrailPoint[] = [];
  private ripples: Ripple[] = [];
  private motes: Mote[] = [];
  private markerEl: Element | null = null;
  private ghostEl: Element | null = null;
  private markerCacheAt = 0;
  private motionQuery: MediaQueryList | null = null;
  private onMotionChange: (() => void) | null = null;

  constructor(map: MaplibreMap) {
    this.map = map;
    const canvasParent = map.getCanvas()?.parentElement;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nh-atmosphere';
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    if (canvasParent) {
      canvasParent.style.position = canvasParent.style.position || 'relative';
      canvasParent.appendChild(this.canvas);
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('NeighbourhoodAtmosphere: 2d context unavailable');
    this.ctx = ctx;
    this.resize();
    this.seedMotes();
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onMotionChange = () => this.renderOnce();
      this.motionQuery.addEventListener?.('change', this.onMotionChange);
    }
    map.on?.('resize', this.resize);
    map.on?.('move', this.renderOnce);
    map.on?.('moveend', this.renderOnce);
    this.start();
  }

  /** Ledger ground for soft glows — called whenever the neighbourhood syncs. */
  public setCells(cells: { id: string; visits: number }[]): void {
    this.cells = cells
      .slice(0, MAX_GLOWS)
      .map((c) => ({ id: c.id, strength: Math.min(1, c.visits / 4) }));
    for (const c of this.cells) {
      if (!this.centroids.has(c.id)) {
        const center = centroidOf(c.id);
        if (center) this.centroids.set(c.id, center);
      }
    }
    this.renderOnce();
  }

  /** A fix becomes chalk on the map — only accurate fixes draw, matching credit. */
  public pushFix(lng: number, lat: number, accuracy?: number): void {
    if (Number.isFinite(accuracy) && (accuracy as number) > 50) return;
    const last = this.trail[this.trail.length - 1];
    if (last && distM(last, { lng, lat }) < TRAIL_MIN_STEP_M) return;
    this.trail.push({ lng, lat, at: Date.now() });
    const cutoff = Date.now() - TRAIL_MAX_AGE_MS;
    while (this.trail.length && this.trail[0].at < cutoff) this.trail.shift();
    while (this.trail.length > TRAIL_MAX_POINTS) this.trail.shift();
  }

  /** Celebration rings where ground was claimed or deepened. */
  public pulse(ids: string[], big = true): void {
    for (const id of ids) {
      const center = this.centroids.get(id) ?? centroidOf(id);
      if (!center) continue;
      this.centroids.set(id, center);
      this.ripples.push({ ...center, at: Date.now(), big });
    }
    while (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }

  public dispose(): void {
    this.destroyed = true;
    this.stop();
    this.motionQuery?.removeEventListener?.('change', this.onMotionChange as EventListener);
    this.map.off?.('resize', this.resize);
    this.map.off?.('move', this.renderOnce);
    this.map.off?.('moveend', this.renderOnce);
    this.canvas.remove();
  }

  private seedMotes(): void {
    this.motes = [];
    for (let i = 0; i < MOTES; i++) {
      this.motes.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.8,
        vx: (Math.random() - 0.5) * 0.00012,
        vy: -0.00004 - Math.random() * 0.00008,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderOnce();
  };

  private renderOnce = (): void => {
    if (!prefersReducedMotion()) return;
    this.draw(performance.now());
  };

  private start(): void {
    if (this.running || this.destroyed) return;
    this.running = true;
    let last = 0;
    const tick = (now: number) => {
      if (this.destroyed) return;
      if (now - last > 33) {
        last = now;
        this.draw(now);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private still(): boolean {
    return prefersReducedMotion();
  }

  private draw(now: number): void {
    const { ctx, canvas } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const t = this.still() ? 0 : now / 1000;
    ctx.clearRect(0, 0, w, h);

    this.drawLight(w, h, t);
    this.drawMotes(w, h, t);
    this.drawGlows(now, t);
    this.drawTrail(now, t);
    this.drawRipples(now, t);
    this.drawMarkerHalos(now);
  }

  /** Two broad shafts of "sun" crossing the print, barely there. */
  private drawLight(w: number, h: number, t: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 2; i++) {
      const speed = 0.008 + i * 0.005;
      const x = ((t * speed + i * 0.45) % 1.4) * w - w * 0.2;
      const grad = ctx.createLinearGradient(x - w * 0.18, 0, x + w * 0.18, h);
      grad.addColorStop(0, 'rgba(248,244,232,0)');
      grad.addColorStop(0.5, `rgba(248,244,232,${0.028 + i * 0.012})`);
      grad.addColorStop(1, 'rgba(248,244,232,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  private drawMotes(w: number, h: number, t: number): void {
    const { ctx } = this;
    ctx.save();
    for (const m of this.motes) {
      let x = m.x;
      let y = m.y;
      if (!this.still()) {
        x += m.vx * t * 1000 * 0.06;
        y += m.vy * t * 1000 * 0.06;
        x += Math.sin(t * 0.4 + m.phase) * 0.0012;
        y += Math.cos(t * 0.3 + m.phase) * 0.001;
        if (x < -0.02) x += 1.04;
        if (x > 1.02) x -= 1.04;
        if (y < -0.02) y += 1.04;
        if (y > 1.02) y -= 1.04;
      }
      const twinkle = this.still() ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.9 + m.phase);
      ctx.globalAlpha = 0.05 + twinkle * 0.08;
      ctx.fillStyle = C.chalk;
      ctx.beginPath();
      ctx.arc(x * w, y * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Soft verdigris breath on ledger ground — brighter the deeper the cell. */
  private drawGlows(now: number, t: number): void {
    const { ctx } = this;
    for (const cell of this.cells) {
      if (cell.strength <= 0) continue;
      const center = this.centroids.get(cell.id);
      if (!center) continue;
      const p = this.map.project([center.lng, center.lat]);
      if (
        p.x < -80 ||
        p.y < -80 ||
        p.x > this.canvas.clientWidth + 80 ||
        p.y > this.canvas.clientHeight + 80
      ) {
        continue;
      }
      const pulse = this.still() ? 0.75 : 0.75 + 0.25 * Math.sin(t * 0.6 + cell.id.charCodeAt(0));
      const radius = 46 + cell.strength * 60;
      const alpha = (0.028 + cell.strength * 0.05) * pulse;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grad.addColorStop(0, hexA(C.verdigris, alpha));
      grad.addColorStop(0.6, hexA(C.cyan, alpha * 0.5));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    void now;
  }

  /** The runner's path, drawn as fading chalk dots behind them. */
  private drawTrail(now: number, t: number): void {
    const { ctx } = this;
    if (this.trail.length < 2) return;
    const cutoff = now - TRAIL_MAX_AGE_MS;
    ctx.save();
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      if (a.at < cutoff && b.at < cutoff) continue;
      const age = Math.max(0, now - b.at);
      const fade = Math.max(0, 1 - age / TRAIL_MAX_AGE_MS);
      const pa = this.map.project([a.lng, a.lat]);
      const pb = this.map.project([b.lng, b.lat]);
      const wobble = this.still() ? 0 : Math.sin(t * 1.4 + i * 0.7) * 0.5;
      ctx.globalAlpha = 0.34 * fade;
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pa.x + wobble, pa.y);
      ctx.lineTo(pb.x + wobble, pb.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Expanding rings where ground was claimed — the print developing. */
  private drawRipples(now: number, t: number): void {
    const { ctx } = this;
    this.ripples = this.ripples.filter((r) => now - r.at < 1600);
    for (const r of this.ripples) {
      const age = (now - r.at) / 1600;
      const p = this.map.project([r.lng, r.lat]);
      for (let k = 0; k < 2; k++) {
        const local = Math.min(1, Math.max(0, age * 1.15 - k * 0.18));
        if (local <= 0 || local >= 1) continue;
        const radius = (r.big ? 90 : 55) * (0.25 + local * 1.5);
        ctx.globalAlpha = (1 - local) * 0.4;
        ctx.strokeStyle = k === 0 ? C.amber : C.verdigris;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    void t;
  }

  /** Soft halos so the runner seal and ghost wisp read as bodies, not pins. */
  private drawMarkerHalos(now: number): void {
    const { ctx } = this;
    if (now - this.markerCacheAt > 800) {
      this.markerCacheAt = now;
      const parent = this.canvas.parentElement;
      this.markerEl = parent?.querySelector('.nh-marker') ?? null;
      this.ghostEl = parent?.querySelector('.nh-ghost-marker') ?? null;
    }
    const halos: { el: Element | null; color: string; radius: number; alpha: number }[] = [
      { el: this.markerEl, color: C.amber, radius: 34, alpha: 0.16 },
      { el: this.ghostEl, color: C.cyan, radius: 30, alpha: 0.14 },
    ];
    for (const h of halos) {
      if (!h.el) continue;
      const rect = (h.el as HTMLElement).getBoundingClientRect();
      const parentRect = this.canvas.getBoundingClientRect();
      if (!rect.width) continue;
      const x = rect.left - parentRect.left + rect.width / 2;
      const y = rect.top - parentRect.top + rect.height / 2;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, h.radius);
      grad.addColorStop(0, hexA(h.color, h.alpha));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, h.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
