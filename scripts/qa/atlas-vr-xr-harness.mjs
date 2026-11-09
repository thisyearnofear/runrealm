// Bounded WebXR smoke test for /atlas-vr/ using Chrome's WebXR Test API.
// Launches real Chrome with --enable-features=WebXRTest, simulates a headset,
// enters a session for a capped number of frames, fires controller input,
// captures a screenshot, and exits. Hard-timeout kills Chrome regardless.
// Usage: node scripts/qa/atlas-vr-xr-harness.mjs <baseUrl> <outDir>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3001';
const outDir = process.argv[3] ?? '/tmp/atlas-vr-xr';
const chromeBin = process.env.CHROME_BIN ?? 'google-chrome';
const profile = mkdtempSync(join(tmpdir(), 'atlas-vr-xr-'));
const port = 9222 + (process.pid % 500);
const result = {
  supported: null,
  sessionEntered: false,
  frames: 0,
  selectFired: false,
  squeezeFired: false,
  errors: [],
};

let ws;
let chrome;
let msgId = 0;
const pending = new Map();

const hardTimeout = setTimeout(() => {
  result.errors.push('hard-timeout');
  finish(1);
}, 60000);
hardTimeout.unref();

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

async function evaluate(expression, sessionId) {
  const r = await send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true, timeout: 20000 },
    sessionId
  );
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
  return r.result?.value;
}

function finish(code) {
  try {
    ws?.close();
  } catch {}
  try {
    chrome?.kill('SIGKILL');
  } catch {}
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  writeFileSync(join(outDir, 'xr-harness-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(code);
}

process.on('SIGTERM', () => finish(1));
process.on('uncaughtException', (e) => {
  result.errors.push(String(e));
  finish(1);
});

try {
  chrome = spawn(
    chromeBin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--enable-features=WebXRTest',
      '--enable-unsafe-swiftshader',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await sleep(2000);
  let target;
  for (let i = 0; i < 20; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page');
      if (target) break;
    } catch {}
    await sleep(500);
  }
  if (!target) throw new Error('no CDP target — chrome failed to start');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const sessionId = undefined;
  await send('Page.enable', {}, sessionId);
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false },
    sessionId
  );
  await send('Page.navigate', { url: `${baseUrl}/atlas-vr/` }, sessionId);
  await sleep(3500);

  const xrTest = `
    (async () => {
      const out = { supported: null, sessionEntered: false, frames: 0, selectFired: false, squeezeFired: false, errors: [] };
      try {
        if (!navigator.xr || !navigator.xr.test) { out.errors.push('WebXRTest unavailable'); return out; }
        const device = await navigator.xr.test.simulateDeviceConnection({ supportsImmersive: true });
        out.supported = await navigator.xr.isSessionSupported('immersive-vr');
        if (!out.supported) return out;
        const btn = document.querySelector('[data-testid="enter-vr"], button');
        btn?.click();
        await new Promise((res, rej) => setTimeout(res, 2500));
        const session = window.__atlasVrSession ?? null;
        out.sessionEntered = !!session;
        if (!session) { out.errors.push('session not exposed'); return out; }
        const src = await device.simulateInputSourceConnection({
          handedness: 'right', targetRayMode: 'tracked-pointer', profiles: ['oculus-touch-v3'],
          supportsSqueeze: true,
        });
        src.primaryInputSource.beginSelection(); src.primaryInputSource.endSelection();
        src.simulateSqueezeBegin(); src.simulateSqueezeEnd();
        await new Promise((res) => setTimeout(res, 1000));
        out.frames = window.__atlasVrFrameCount ?? 0;
        out.selectFired = !!window.__atlasVrSelectFired;
        out.squeezeFired = !!window.__atlasVrSqueezeFired;
        await session.end();
      } catch (e) { out.errors.push(String(e)); }
      return out;
    })()
  `;
  Object.assign(result, await evaluate(xrTest, sessionId));

  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(join(outDir, 'xr-harness-screenshot.png'), Buffer.from(shot.data, 'base64'));
  finish(result.sessionEntered && result.frames > 0 ? 0 : 2);
} catch (e) {
  result.errors.push(String(e));
  finish(1);
}
