/**
 * Confidential Shield reveal choreography — Phase A hero spike.
 *
 * The single source of motion for the Confidential Shield widget. Kept
 * separate from the widget so the widget owns input/state and this module
 * owns *how things appear* (CLEAN separation, MODULAR + testable).
 *
 * GSAP is dynamically imported on first use (adaptive loading) so it stays
 * out of the initial bundle (PERFORMANT). All visuals consume the
 * `--rr-*` design tokens via the `.shield-reveal*` classes in components.css.
 */

export type ShieldTone = 'info' | 'success' | 'warning' | 'error';

function formatBigInt(value: bigint): string {
  // Group with thousands separators for readability (handles are large).
  return value.toLocaleString('en-US');
}

/**
 * The "decrypt reveal" — the climax of the Zama demo. A lock spins while the
 * ciphertext is read, then opens and the score counts up from 0 to `value`
 * in the lime accent. `value` is whatever the service returns today (the
 * `euint32` handle, until relayer user-decryption lands); the final frame
 * snaps to the exact string.
 */
export async function revealDecryptScore(container: HTMLElement, value: bigint): Promise<void> {
  container.innerHTML = `
    <div class="shield-reveal">
      <div class="shield-reveal__lock" aria-hidden="true">🔒</div>
      <div class="shield-reveal__score" aria-live="polite">0</div>
      <div class="shield-reveal__caption">Decrypting on Zama FHE…</div>
    </div>
  `;

  const lock = container.querySelector<HTMLElement>('.shield-reveal__lock');
  const score = container.querySelector<HTMLElement>('.shield-reveal__score');
  const caption = container.querySelector<HTMLElement>('.shield-reveal__caption');
  const root = container.querySelector<HTMLElement>('.shield-reveal');

  const { gsap } = await import('gsap');

  // Spin the lock while "decrypting".
  const spin = lock
    ? gsap.to(lock, { rotate: 360, duration: 0.9, ease: 'none', repeat: -1 })
    : null;

  // Count the score up from 0 → value. Tween a 0→1 progress and derive the
  // bigint from it so arbitrarily large handles animate smoothly.
  const proxy = { p: 0 };
  await new Promise<void>((resolve) => {
    gsap.to(proxy, {
      p: 1,
      duration: 1.15,
      ease: 'power2.out',
      onUpdate: () => {
        const scaled = (value * BigInt(Math.round(proxy.p * 1000))) / 1000n;
        if (score) score.textContent = formatBigInt(scaled);
      },
      onComplete: () => {
        if (score) score.textContent = value.toString();
        resolve();
      },
    });
  });

  // Settle: stop the spin, flip to unlocked, add the privacy caption.
  spin?.kill();
  if (lock) {
    gsap.fromTo(
      lock,
      { rotate: 0, scale: 0.8 },
      { rotate: 0, scale: 1, duration: 0.4, ease: 'back.out(2)' }
    );
    lock.textContent = '🔓';
  }
  if (root) root.classList.add('is-unlocked');
  if (caption) {
    caption.textContent = '🔒 Private — only you can decrypt this on Zama FHE.';
  }
  if (score) {
    gsap.fromTo(score, { scale: 0.92 }, { scale: 1, duration: 0.5, ease: 'power2.out' });
  }
}

/**
 * Success / pending pulse for Boost and Contest. Replaces the old plain
 * text line with a glyph + title + caption and a single lime breath.
 */
export async function revealAction(
  container: HTMLElement,
  opts: { glyph: string; title: string; caption: string }
): Promise<void> {
  container.innerHTML = `
    <div class="shield-reveal shield-reveal--action">
      <div class="shield-reveal__glyph" aria-hidden="true">${opts.glyph}</div>
      <div class="shield-reveal__title">${opts.title}</div>
      <div class="shield-reveal__caption">${opts.caption}</div>
    </div>
  `;

  const { gsap } = await import('gsap');
  const root = container.querySelector<HTMLElement>('.shield-reveal');
  if (root) {
    gsap.fromTo(
      root,
      { opacity: 0, y: 6, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'power2.out' }
    );
  }
  const glyph = container.querySelector<HTMLElement>('.shield-reveal__glyph');
  if (glyph) {
    gsap.fromTo(glyph, { scale: 0.6 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
  }
}
