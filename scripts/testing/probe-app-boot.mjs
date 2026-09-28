#!/usr/bin/env node
/**
 * Ephemeral local verification probe — NOT part of the app.
 *
 * Loads a running dev server in headless Chrome over CDP, collects console
 * output + exceptions, then asserts the app reached its mounted-roots state
 * and that the H8 surfaces actually exist at runtime:
 *   - fog-of-war + owned territory map layers
 *   - the leaderboard screen (local, and merged with the oracle quorum)
 *   - graceful degradation when the platform can't render a map at all
 *
 * Modes (all optional):
 *   node scripts/testing/probe-app-boot.mjs http://localhost:3100/
 *   PROBE_SEED=1      …load with ?seed=1 (the dev link that seeds the demo
 *                      atlas) and assert both layers carry real geometry.
 *   PROBE_NO_WEBGL=1  …block WebGL before boot; asserts the app still
 *                      mounts (map failure must not abort the boot).
 *   PROBE_PULSE=1     …seed the atlas, then drive the contested-cell pulse
 *                      through its whole lifecycle: it runs, self-terminates,
 *                      re-arms on a second `territory:vulnerable` (mid-session),
 *                      and self-terminates again. Takes ~45 s of real waiting
 *                      because the pulse's 20 s clock is honest wall time.
 *                      The seed assertions still run, but the pulse ones are
 *                      owned by this block (the seed block only checks that the
 *                      expired pulse left no layers behind).
 *   PROBE_ORACLE=http://localhost:3210
 *                     …attest a run through the app and assert the board
 *                      merges the oracle's ledger (needs the dev server
 *                      started with NEXT_PUBLIC_RUNREALM_ATTESTATION_ORACLES).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TARGET_URL = process.argv[2] ?? 'http://localhost:3100/';
/** Appended as ?seed=1 in seed mode so the dev link itself is what runs. */
const SEED_QUERY = 'seed';
const CHROME =
  process.env.CHROME_BIN ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.platform === 'win32'
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : 'google-chrome');
const PORT = 9333;
// Hard ceiling on the boot wait. Deliberately large: the first navigation
// against a cold `next dev` makes the browser compile and ship the entire
// client bundle chunk by chunk, which can outlast any stopwatch guess. The
// stall detector below is what decides "hung" — this is only the backstop.
const BOOT_WAIT_MS = Number(process.env.PROBE_BOOT_WAIT_MS ?? 300_000);
// How long the browser may go *completely* quiet (no chunk delivered, no console
// line, no DOM change) before we call the boot hung rather than slow.
const BOOT_STALL_MS = Number(process.env.PROBE_BOOT_STALL_MS ?? 60_000);
const NO_WEBGL = process.env.PROBE_NO_WEBGL === '1';
const PULSE = process.env.PROBE_PULSE === '1';
// The pulse needs claims on the map, so it implies seed mode.
const SEED = process.env.PROBE_SEED === '1' || PULSE;
const ORACLE = process.env.PROBE_ORACLE ?? '';
/** Mirrors CONTESTED_PULSE_MAX_DURATION_MS in map-service.ts (20 s). */
const PULSE_MAX_MS = Number(process.env.PROBE_PULSE_MAX_MS ?? 20_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failures = [];
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const chromeArgs = [
  '--headless=new',
  '--no-sandbox',
  '--no-first-run',
  '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'rr-probe-'))}`,
];
if (!NO_WEBGL) {
  // MapLibre needs a WebGL context. Headless Chrome has no GPU, so allow
  // the SwiftShader software rasterizer for this local probe.
  chromeArgs.push('--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader');
}
chromeArgs.push('about:blank');

const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

/** Force MapLibre's `Failed to initialize WebGL` path deterministically:
 *  the renderer asks for a webgl2/webgl context and gets null. */
const BLOCK_WEBGL = `
  (function () {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...rest);
    };
  })();
`;

async function devtoolsJson(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
  return await res.json();
}

async function main() {
  for (let i = 0; i < 80; i++) {
    try {
      await devtoolsJson('/json/version');
      break;
    } catch {
      await sleep(250);
    }
  }

  const targets = await devtoolsJson('/json/list');
  const page = targets.find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const consoleLines = [];
  const pending = new Map();
  let nextId = 0;
  /** Chunk/asset arrivals — the liveness signal a cold dev-server compile
   *  gives us while the app itself is still a blank page. */
  let networkResponses = 0;

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      consoleLines.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === 'Log.entryAdded') {
      consoleLines.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      consoleLines.push(`[exception] ${d.exception?.description ?? d.text}`);
    } else if (msg.method === 'Network.responseReceived') {
      networkResponses++;
    }
  });

  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  // Count delivered responses before the navigation so the boot wait can tell
  // "still compiling the bundle" from "actually stuck".
  await send('Network.enable');
  if (NO_WEBGL) {
    // Must be installed before any page script runs.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: BLOCK_WEBGL });
  }

  let targetUrl = TARGET_URL;
  if (SEED) {
    const url = new URL(TARGET_URL);
    url.searchParams.set(SEED_QUERY, '1');
    targetUrl = url.toString();
  }
  await send('Page.navigate', { url: targetUrl });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  };

  // Wait for boot to actually finish rather than guessing a fixed
  // duration. `window.RunRealm.map` is set mid-boot (exposeGlobals), so it
  // alone is too early — the last thing bootstrap mounts is the React
  // wallet root, which is the real "boot ran to completion" signal. In
  // no-WebGL mode there is no map to wait for, only the roots.
  const readyExpr = NO_WEBGL
    ? "!!document.getElementById('react-wallet-root')"
    : "!!(window.RunRealm && window.RunRealm.map) && !!document.getElementById('react-wallet-root')";
  // Boot cannot be timed with a stopwatch: a cold `next dev` compiles and ships
  // the client bundle chunk by chunk, so "not ready yet" and "hung" look
  // identical from outside. Wait for the end-of-boot signal for as long as the
  // browser is demonstrably still making progress — chunks arriving, console
  // output, DOM growing — and only give up once it has gone completely quiet.
  const bootFacts = () =>
    evaluate(`JSON.stringify({
      ready: ${readyExpr},
      readyState: document.readyState,
      roots: ['user-dashboard-root','account-screen-root','leaderboard-screen-root','react-wallet-root']
        .filter((id) => document.getElementById(id)).length,
      map: !!window.RunRealm?.map,
      services: !!window.RunRealm?.services
    })`);

  const hardDeadline = Date.now() + BOOT_WAIT_MS;
  const startedAt = Date.now();
  let booted = false;
  let gaveUp = 'quiet';
  let lastProgressAt = startedAt;
  let lastReport = startedAt;
  let lastState = null;
  let fingerprint = '';
  while (!booted && Date.now() < hardDeadline) {
    const state = JSON.parse((await bootFacts()) ?? '{}');
    lastState = state;
    if (state.ready === true) {
      booted = true;
      break;
    }
    // Any of these moving means work is still being done on our behalf.
    const next = JSON.stringify([
      networkResponses,
      consoleLines.length,
      state.readyState,
      state.roots,
      state.map,
      state.services,
    ]);
    if (next !== fingerprint) {
      fingerprint = next;
      lastProgressAt = Date.now();
    } else if (Date.now() - lastProgressAt >= BOOT_STALL_MS) {
      gaveUp = 'stalled';
      break;
    }

    if (Date.now() - lastReport >= 10_000) {
      lastReport = Date.now();
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `  … waiting for boot (${elapsed}s) — ${networkResponses} responses, ` +
          `${consoleLines.length} console lines, ${state.roots}/4 roots, map:${state.map}`
      );
    }
    await sleep(750);
  }
  console.log('PROBE_BOOTED', booted);
  if (!booted) {
    console.log(
      'PROBE_BOOT_WAIT',
      JSON.stringify({
        reason:
          gaveUp === 'stalled'
            ? `no progress for ${BOOT_STALL_MS / 1000}s`
            : 'hit the wait ceiling',
        waitedMs: Date.now() - startedAt,
        responses: networkResponses,
        consoleLines: consoleLines.length,
        lastState,
      })
    );
  }

  const boot = await evaluate(`JSON.stringify({
    title: document.title,
    hasApp: typeof window.RunRealm === 'object' && !!window.RunRealm,
    hasServices: !!window.RunRealm?.services,
    rivalService: !!window.RunRealm?.services?.rivalTerritoryService,
    roots: ['user-dashboard-root','account-screen-root','leaderboard-screen-root','react-wallet-root']
      .filter((id) => document.getElementById(id)),
    leaderboardScreenMounted: !!document.getElementById('leaderboard-screen'),
    mapCanvas: !!document.querySelector('#maplibre-container canvas'),
    mapInstance: !!window.RunRealm?.map,
    seedAvailable: typeof window.seedDemoAtlas === 'function',
    rivals: window.RunRealm?.services?.rivalTerritoryService?.getRivalTerritories?.().length ?? null
  })`);
  console.log('PROBE_BOOT', boot);

  const bootInfo = JSON.parse(boot ?? '{}');
  const fatalBoot = consoleLines.some((l) => /Failed to initialize RunRealm/.test(l));
  check(
    'boot reached its mounted-roots state',
    booted === true,
    booted ? '' : JSON.stringify(lastState)
  );
  check('every root mounted', (bootInfo.roots ?? []).length === 4, JSON.stringify(bootInfo.roots));
  check('services are reachable', bootInfo.hasServices === true);
  check('boot did not fail hard', !fatalBoot);

  if (NO_WEBGL) {
    // The map layer can't exist; everything else must.
    check(
      'map failure is announced, not thrown',
      consoleLines.some((l) => /Map unavailable — continuing without the atlas/.test(l))
    );
    check(
      'no uncaught WebGL exception surfaced',
      !consoleLines.some((l) => /Failed to initialize WebGL/.test(l) && /\[exception\]/.test(l))
    );
    // MapLibre builds the <canvas> in _setupContainer() and only then fails
    // to get a context, so an orphan canvas element is expected; what must
    // not exist is a map the app believes in.
    check('no map instance was handed to the app', bootInfo.mapInstance === false);
    console.log('PROBE_DEGRADED', JSON.stringify({ fatalBoot, mapCanvas: bootInfo.mapCanvas }));
  } else {
    check('map canvas exists', bootInfo.mapCanvas === true);
  }

  const mapLayers = await evaluate(`(function () {
    const m = window.RunRealm?.map;
    if (!m || typeof m.getLayer !== 'function') return JSON.stringify({ map: false });
    return JSON.stringify({
      map: true,
      rivalSource: !!m.getSource('rival-territory-source'),
      rivalLayer: !!m.getLayer('rival-territory-layer'),
      rivalBorderLayer: !!m.getLayer('rival-territory-border-layer'),
      ownedSource: !!m.getSource('owned-territory-source')
    });
  })()`);
  console.log('PROBE_MAP_LAYERS', mapLayers);

  if (!NO_WEBGL) {
    const layers = JSON.parse(mapLayers ?? '{}');
    // The fog layer must exist even when the feed is empty (presence is the
    // point); the owned layer only appears once something is claimed.
    check('rival source + layers are wired', layers.rivalSource === true);
    check('rival border layer is wired', layers.rivalBorderLayer === true);
  } else {
    check('map-dependent layers stay absent', JSON.parse(mapLayers ?? '{}').map === false);
  }

  if (PULSE) {
    // The pulse is a private-field rAF loop, so the only honest signal that
    // it is alive is that field (present at runtime) plus the layers it owns.
    const pulseState = () =>
      evaluate(`(function () {
        const m = window.RunRealm?.map;
        const svc = window.RunRealm?.services?.mapService;
        if (!m || !svc) return JSON.stringify({ error: 'no map or mapService' });
        const owned = m.getSource('owned-territory-source')?.serialize?.().data?.features ?? [];
        return JSON.stringify({
          running: typeof svc.contestedPulseRafId === 'number',
          startMs: Math.round(svc.contestedPulseStartMs ?? 0),
          fill: !!m.getLayer('contested-cells-layer'),
          border: !!m.getLayer('contested-cells-border-layer'),
          cells: m.getSource('contested-cells-source')?.serialize?.().data?.features?.length ?? null,
          ownedStill: owned.some((f) => f.properties?.defenseStatus === 'vulnerable')
        });
      })()`);

    const retrigger = () =>
      evaluate(`(function () {
        const s = window.RunRealm?.services;
        const t = (s?.territory?.getClaimedTerritories?.() ?? [])
          .find((x) => x.id === 'territory_demo_vulnerable');
        if (!t) return 'no decayed claim to re-trigger';
        // Exactly what a real decay sweep emits — not a direct service call.
        s.eventBus.emit('territory:vulnerable', { territory: t });
        return 'ok';
      })()`);

    let first = JSON.parse((await pulseState()) ?? '{}');
    console.log('PROBE_PULSE_RUNNING', JSON.stringify(first));
    if (first.running !== true) {
      // A slow boot can outlive the pulse seeded at startup, and no assertion
      // here is worth failing over machine speed — arm a known baseline.
      await retrigger();
      await sleep(400);
      first = JSON.parse((await pulseState()) ?? '{}');
      console.log('PROBE_PULSE_BASELINE_REARMED', JSON.stringify(first));
    }
    check('the seeded pulse is running', first.running === true, JSON.stringify(first));
    check(
      'it owns the contested cells',
      first.fill === true && first.border === true && (first.cells ?? 0) > 0,
      JSON.stringify(first)
    );

    // 1. Self-termination: no trigger, 20 s of wall time, then it stops by
    //    itself and takes its layers with it.
    await sleep(PULSE_MAX_MS + 1200);
    const stopped = JSON.parse((await pulseState()) ?? '{}');
    console.log('PROBE_PULSE_EXPIRED', JSON.stringify(stopped));
    check(
      'the pulse self-terminates (rAF loop released)',
      stopped.running === false,
      JSON.stringify(stopped)
    );
    check(
      'it removes its own layers when it stops',
      stopped.fill === false && stopped.border === false && stopped.cells === null,
      JSON.stringify(stopped)
    );
    check(
      'the vulnerable fill stays (the pulse is attention, not information)',
      stopped.ownedStill === true,
      JSON.stringify(stopped)
    );

    // 2. Mid-session re-arm: the same event a decay sweep emits must bring it
    //    back, with a fresh clock.
    const emitted = await retrigger();
    await sleep(400);
    const restarted = JSON.parse((await pulseState()) ?? '{}');
    console.log('PROBE_PULSE_RESTARTED', JSON.stringify({ emitted, ...restarted }));
    check('a second territory:vulnerable re-arms the pulse', emitted === 'ok', String(emitted));
    check(
      'the restarted pulse is running again',
      restarted.running === true,
      JSON.stringify(restarted)
    );
    check(
      'the restart rebuilt its geometry',
      restarted.fill === true && restarted.border === true && (restarted.cells ?? 0) > 0,
      JSON.stringify(restarted)
    );
    check(
      'the restart reset its clock (it did not resume the expired one)',
      (restarted.startMs ?? 0) > (first.startMs ?? 0),
      `${first.startMs} → ${restarted.startMs}`
    );

    // 3. And the restarted loop terminates on its own too — a re-arm must not
    //    leave a permanent rAF loop behind.
    await sleep(PULSE_MAX_MS + 1200);
    const stoppedAgain = JSON.parse((await pulseState()) ?? '{}');
    console.log('PROBE_PULSE_EXPIRED_AGAIN', JSON.stringify(stoppedAgain));
    check(
      'the restarted pulse self-terminates too',
      stoppedAgain.running === false && stoppedAgain.fill === false && stoppedAgain.cells === null,
      JSON.stringify(stoppedAgain)
    );
  }

  if (SEED) {
    // Seeding happened at boot through ?seed=1; read the service state it
    // left behind rather than calling the helper ourselves.
    await sleep(600); // let the layers settle before measuring geometry
    const seeded = await evaluate(`(function () {
      const s = window.RunRealm?.services;
      if (!s) return JSON.stringify({ error: 'no services' });
      const owned = s.territory?.getClaimedTerritories?.() ?? [];
      const demo = owned.find((t) => t.id === 'territory_demo_owned') ?? null;
      const decayed = owned.find((t) => t.id === 'territory_demo_vulnerable') ?? null;
      return JSON.stringify({
        helper: typeof window.seedDemoAtlas,
        owned: owned.length,
        demoOwned: demo?.id ?? null,
        demoCells: demo?.h3Cells?.length ?? 0,
        demoVulnerable: decayed?.id ?? null,
        vulnerableStatus: decayed?.defenseStatus ?? null,
        vulnerablePoints: decayed?.activityPoints ?? null,
        rivals: (s.rivalTerritoryService?.getRivalTerritories?.() ?? []).length
      });
    })()`);
    const atlas = await evaluate(`(function () {
      const m = window.RunRealm?.map;
      if (!m) return JSON.stringify({ map: false });
      // MapLibre keeps the GeoJSON on the source's private _data / serialized
      // options — there is no public .data property to read.
      const features = (id) => {
        const src = m.getSource(id);
        if (!src) return null;
        const data = src.serialize?.().data ?? src._data ?? src.data;
        return data?.features ?? null;
      };
      const owned = features('owned-territory-source');
      const rival = features('rival-territory-source');
      return JSON.stringify({
        ownedFeatures: owned?.length ?? null,
        ownedGeometry: owned?.[0]?.geometry?.type ?? null,
        ownedCells: owned?.[0]?.geometry?.coordinates?.[0]?.length ?? null,
        ownedStatuses: owned?.map((f) => f.properties?.defenseStatus) ?? null,
        rivalFeatures: rival?.length ?? null,
        rivalGeometry: rival?.[0]?.geometry?.type ?? null,
        rivalProperties: rival?.[0] ? Object.keys(rival[0].properties).sort() : null,
        contestedLayer: !!m.getLayer('contested-cells-layer'),
        contestedBorderLayer: !!m.getLayer('contested-cells-border-layer'),
        contestedCells:
          m.getSource('contested-cells-source')?.serialize?.().data?.features?.length ?? null
      });
    })()`);
    console.log('PROBE_ATLAS_SEED', seeded);
    console.log('PROBE_ATLAS_LAYERS', atlas);

    const seedInfo = JSON.parse(seeded ?? '{}');
    const atlasInfo = JSON.parse(atlas ?? '{}');
    check('the dev helper is still exposed for the console', seedInfo.helper === 'function');
    check('?seed=1 persisted a demo claim', seedInfo.demoOwned === 'territory_demo_owned', seeded);
    check('the seeded claim covers multiple cells', (seedInfo.demoCells ?? 0) > 1);
    check(
      '?seed=1 also persisted a decayed claim',
      seedInfo.demoVulnerable === 'territory_demo_vulnerable',
      seeded
    );
    check(
      'the decayed claim is genuinely in the vulnerable band',
      seedInfo.vulnerableStatus === 'vulnerable' && (seedInfo.vulnerablePoints ?? 0) > 0,
      seeded
    );
    check('owned layer renders both seeded claims', (atlasInfo.ownedFeatures ?? 0) >= 2, atlas);
    check(
      'the decayed claim paints in the vulnerable color',
      (atlasInfo.ownedStatuses ?? []).includes('vulnerable'),
      String(atlasInfo.ownedStatuses)
    );
    if (PULSE) {
      // The lifecycle block above already proved the pulse existed, expired and
      // re-armed; here we only require that nothing was left behind.
      check(
        'the expired pulse left no layers behind',
        atlasInfo.contestedLayer === false && atlasInfo.contestedBorderLayer === false,
        atlas
      );
    } else {
      check(
        'the contested-cell pulse is running',
        atlasInfo.contestedLayer === true && (atlasInfo.contestedCells ?? 0) > 0,
        atlas
      );
    }
    check('rival (fog) layer renders silhouettes', (atlasInfo.rivalFeatures ?? 0) >= 1, atlas);
    check(
      'fog features carry presence only',
      JSON.stringify(atlasInfo.rivalProperties) === '["id","owner","visibility"]',
      String(atlasInfo.rivalProperties)
    );
  }

  if (ORACLE) {
    // Drive the real client path: AttestationService → HttpAttestationOracle
    // → the running oracle's ledger.
    const attested = await evaluate(`(async function () {
      try {
        const services = window.RunRealm?.services;
        const svc = services?.attestationService ?? services?.attestation;
        if (!svc) return JSON.stringify({ error: 'no attestation service' });
        const now = Date.now();
        const points = Array.from({ length: 12 }, (_, i) => ({
          lat: 40.785091 + i * 0.0004,
          lng: -73.968285 + i * 0.0004
        }));
        const att = await svc.attestRun({
          id: 'probe_browser_run_1',
          totalDistance: 5000,
          totalDuration: 1500000,
          endTime: now - 1000,
          territoryEligible: true,
          points
        });
        return JSON.stringify({
          id: att?.id ?? null,
          status: att?.status ?? null,
          signatures: att?.signatures?.length ?? 0,
          oracle: services?.config?.getAttestationOracleUrls?.() ?? null
        });
      } catch (e) { return JSON.stringify({ error: String(e) }); }
    })()`);
    console.log('PROBE_ATTEST', attested);

    const att = JSON.parse(attested ?? '{}');
    check(
      'the app has an oracle configured',
      Array.isArray(att.oracle) && att.oracle.length === 1,
      attested
    );
    check('the run was attested with an oracle signature', (att.signatures ?? 0) >= 1, attested);
    check('a signed run is no longer "local"', att.status === 'pending', String(att.status));

    // A second runner, signed straight against the oracle (not through this
    // app's ledger): that is the row the local board cannot produce, so it is
    // what "merged network board" actually means.
    const otherRunner = await evaluate(`(async function () {
      try {
        const message = {
          runId: 'probe_network_runner',
          accountId: '0xfeedface00000000000000000000000000000001',
          distanceMeters: 8400,
          durationMs: 30 * 60 * 1000,
          paceBand: 2,
          h3Cells: ['892a1072b4bffff'],
          endedAt: Date.now() - 5000
        };
        const res = await fetch('${ORACLE}/attestations/sign', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            domain: { name: 'RunRealm Attestation', version: '1', chainId: 0 },
            primaryType: 'RunSummary',
            types: {
              RunSummary: [
                { name: 'runId', type: 'string' },
                { name: 'accountId', type: 'string' },
                { name: 'distanceMeters', type: 'uint256' },
                { name: 'durationMs', type: 'uint256' },
                { name: 'paceBand', type: 'uint8' },
                { name: 'h3Cells', type: 'string[]' },
                { name: 'endedAt', type: 'uint256' }
              ]
            },
            message
          })
        });
        return JSON.stringify({ status: res.status, body: await res.json() });
      } catch (e) { return JSON.stringify({ error: String(e) }); }
    })()`);
    console.log('PROBE_OTHER_RUNNER', otherRunner);
    check(
      'the oracle signed a second runner\u2019s summary',
      JSON.parse(otherRunner ?? '{}').status === 200,
      otherRunner
    );

    await evaluate(`window.RunRealm?.services?.navigation?.navigateTo('leaderboard')`);
    await sleep(1200);
  } else {
    await evaluate(`window.RunRealm?.services?.navigation?.navigateTo('leaderboard')`);
    await sleep(700);
  }

  const leaderboard = await evaluate(`JSON.stringify({
    visible: !!document.getElementById('leaderboard-screen')
      && !document.getElementById('leaderboard-screen').classList.contains('hidden'),
    scope: document.querySelector('#leaderboard-screen .leaderboard-scope')?.textContent ?? null,
    rows: Array.from(document.querySelectorAll('#leaderboard-screen .leaderboard-table tbody tr'))
      .map((tr) => ({
        // The kind emoji lives inside the runner cell; strip it so labels
        // can be compared literally.
        label: (tr.querySelector('.runner')?.textContent ?? '').replace(/[^\x20-\x7E\u00B7]/g, '').trim() || null,
        proof: tr.querySelector('.proof')?.textContent?.trim() ?? null,
        band: tr.querySelector('.band')?.textContent?.trim() ?? null,
        distance: tr.querySelector('.distance')?.textContent?.trim() ?? null
      })),
    empty: !!document.querySelector('#leaderboard-screen .leaderboard-empty')
  })`);
  console.log('PROBE_LEADERBOARD', leaderboard);

  const board = JSON.parse(leaderboard ?? '{}');
  check('leaderboard screen opens', board.visible === true);

  if (ORACLE) {
    check(
      'board is scoped local + network',
      String(board.scope ?? '').startsWith('Local + network board'),
      String(board.scope)
    );
    check(
      'your signed run shows as attested',
      (board.rows ?? []).some((r) => r.label === 'You' && r.proof === 'attested'),
      JSON.stringify(board.rows)
    );
    check(
      'the oracle ledger row merged in, pseudonymously',
      (board.rows ?? []).some((r) => /^runner · /.test(r.label ?? '') && r.proof === 'attested'),
      JSON.stringify(board.rows)
    );
    check(
      'the same run is not listed twice',
      new Set((board.rows ?? []).map((r) => r.label)).size === (board.rows ?? []).length,
      JSON.stringify(board.rows)
    );
  } else {
    check(
      'board falls back to local scope without an oracle',
      String(board.scope ?? '').startsWith('Local board'),
      String(board.scope)
    );
  }

  console.log('CONSOLE_LINES', consoleLines.length);
  for (const line of consoleLines.slice(-60)) console.log('  ' + line);
  console.log('ERROR_LINES');
  for (const line of consoleLines.filter((l) => /error|exception|failed|refused/i.test(l))) {
    console.log('  ' + line);
  }

  ws.close();
}

main()
  .catch((err) => {
    console.error('probe failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    chrome.kill('SIGKILL');
    if (failures.length > 0) {
      console.error(`PROBE_FAILURES ${failures.length}: ${failures.join(' | ')}`);
      process.exitCode = 1;
    }
    setTimeout(() => process.exit(process.exitCode ?? 0), 300);
  });
