'use client';

import type { WorldSnapshot } from '@runrealm/shared-core/types/world-state';
import { useEffect, useRef } from 'react';

interface OrbisStageCanvasProps {
  snapshot: WorldSnapshot;
  /** False reduces motion to a still frame (prefers-reduced-motion). */
  animate?: boolean;
}

type Palette = { sky: [string, string]; ink: string; accent: string };

const PALETTES: Record<string, Palette> = {
  dawn: { sky: ['#1b1430', '#4a2a3c'], ink: '#f2d3a2', accent: '#f2a541' },
  day: { sky: ['#0b2740', '#134a5e'], ink: '#d8f3f5', accent: '#63b3c8' },
  dusk: { sky: ['#221237', '#3a1f4e'], ink: '#e6d5f7', accent: '#9a6fc4' },
  night: { sky: ['#050d1c', '#0a1e33'], ink: '#bcd6e8', accent: '#3f6d8c' },
};

const STATUS_COLORS: Record<string, string> = {
  none: '#63b3c8',
  exposing: '#f2a541',
  developing: '#e8c96a',
  developed: '#4fae8b',
  vulnerable: '#e85d5d',
  contested: '#e85d5d',
};

function hashCell(cell: string): number {
  let hash = 0;
  for (let i = 0; i < cell.length; i += 1) hash = (hash * 31 + cell.charCodeAt(i)) >>> 0;
  return hash;
}

/**
 * Procedural world mirror: renders the WorldSnapshot as a living cyanotype
 * atlas. Driven purely by semantic state — no GPS, no assets, no network.
 */
export function OrbisStageCanvas({ snapshot, animate = true }: OrbisStageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let phase = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const render = () => {
      const snap = snapshotRef.current;
      const palette = PALETTES[snap.timeOfDay in PALETTES ? snap.timeOfDay : 'night'];
      const status = STATUS_COLORS[snap.territoryStatus] ?? STATUS_COLORS.none;
      const threat = Math.min(1, Math.max(0, snap.threatLevel));
      const { width, height } = canvas;
      const t = phase;

      // Sky
      const sky = ctx.createLinearGradient(0, 0, width * 0.3, height);
      sky.addColorStop(0, palette.sky[0]);
      sky.addColorStop(1, palette.sky[1]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      // H3 hex lattice; the exposed cell glows with the territory palette
      const hexSize = Math.max(26, Math.min(width, height) / 9);
      const hexWidth = hexSize * Math.sqrt(3);
      const cellHash = snap.currentCell ? hashCell(snap.currentCell) : -1;
      ctx.lineWidth = 1;
      for (let row = -1; row * hexSize * 1.5 < height + hexSize; row += 1) {
        for (let col = -1; col * hexWidth < width + hexWidth; col += 1) {
          const cx = col * hexWidth + (row % 2 ? hexWidth / 2 : 0);
          const cy = row * hexSize * 1.5;
          const isCell = cellHash >= 0 && (row * 97 + col) % 997 === cellHash % 997;
          ctx.beginPath();
          for (let i = 0; i < 6; i += 1) {
            const angle = (Math.PI / 3) * i + Math.PI / 6;
            const x = cx + hexSize * 0.94 * Math.cos(angle);
            const y = cy + hexSize * 0.94 * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          if (isCell) {
            const pulse = 0.35 + 0.25 * Math.sin(t * 2.4 + threat * 6);
            ctx.globalAlpha = 0.16 + pulse * 0.3;
            ctx.fillStyle = status;
            ctx.fill();
            ctx.globalAlpha = 0.55 + pulse * 0.4;
            ctx.strokeStyle = status;
            ctx.stroke();
            ctx.globalAlpha = 1;
          } else {
            ctx.strokeStyle = palette.ink;
            ctx.globalAlpha = 0.07;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      // Runner trace
      const baseY = height * 0.62;
      const paceBoost = snap.paceBand === 'sprint' ? 1.6 : snap.paceBand === 'fast' ? 1.25 : 1;
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 8) {
        const y =
          baseY +
          Math.sin(x * 0.008 + t * 0.9 * paceBoost) * height * 0.05 +
          Math.sin(x * 0.021 - t * 0.54 * paceBoost) * height * 0.02;
        if (x <= -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = status;
      ctx.lineWidth = 3;
      ctx.shadowColor = status;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Runner head
      const headX = ((t * 60 * paceBoost) % (width + 160)) - 80;
      const headY =
        baseY +
        Math.sin(headX * 0.008 + t * 0.9 * paceBoost) * height * 0.05 +
        Math.sin(headX * 0.021 - t * 0.54 * paceBoost) * height * 0.02;
      ctx.beginPath();
      ctx.arc(headX, headY, 5, 0, Math.PI * 2);
      ctx.fillStyle = palette.ink;
      ctx.shadowColor = palette.ink;
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Ghost trail — pulls ahead during the race, haunts behind while defending
      if (snap.ghostPresence !== 'none') {
        const ahead = snap.ghostPresence === 'racing' ? 140 : 40;
        const gx = headX + ahead;
        const gy =
          baseY +
          (snap.ghostPresence === 'racing' ? -14 : 6) +
          Math.sin(gx * 0.008 + t * 0.9 * paceBoost + 0.8) * height * 0.05;
        ctx.beginPath();
        for (let x = -20; x <= width + 20; x += 8) {
          const y =
            baseY +
            (snap.ghostPresence === 'racing' ? -14 : 6) +
            Math.sin(x * 0.008 + t * 1.1 * paceBoost + 0.8) * height * 0.05;
          if (x <= -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(248, 244, 232, 0.7)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(gx, gy, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(248, 244, 232, 0.9)';
        ctx.fill();
      }

      // Threat pulse vignette — coral breaths scale with threat level
      if (threat > 0.05) {
        const pulse = (Math.sin(t * (1.5 + threat * 4)) * 0.5 + 0.5) * threat;
        const vignette = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.3,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.75
        );
        vignette.addColorStop(0, 'rgba(232, 93, 93, 0)');
        vignette.addColorStop(1, `rgba(232, 93, 93, ${0.05 + pulse * 0.28})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
      }

      // Settled calm — verdigris wash once the territory is fixed
      if (snap.territoryStatus === 'developed' || snap.runStatus === 'completed') {
        ctx.fillStyle = 'rgba(79, 174, 139, 0.05)';
        ctx.fillRect(0, 0, width, height);
      }
      if ((animate && !reduceMotion) || phase === 0) phase += 0.016;
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [animate]);

  return <canvas ref={canvasRef} className="orbis-stage-canvas" tabIndex={-1} aria-hidden="true" />;
}
