'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type BootStatus = 'loading' | 'ready' | 'error';

const RETRY_COOLDOWN_MS = 1200;

function BootSplash({
  status,
  phase,
  showSkip,
  slow,
  onRetry,
  onSkip,
}: {
  status: BootStatus;
  phase: string;
  showSkip: boolean;
  slow: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: full-screen splash overlay is not a form output element
    <div
      className={`boot-splash${status === 'ready' ? ' is-leaving' : ''}${
        status === 'error' ? ' boot-splash--error' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-busy={status === 'loading'}
    >
      <div className="boot-splash__aura" aria-hidden="true" />
      <div className="boot-splash__content">
        <svg
          className="boot-splash__hex"
          viewBox="0 0 120 120"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <polygon
            className="boot-splash__hex-fill"
            points="60,20 94,40 94,80 60,100 26,80 26,40"
          />
          <polygon
            className="boot-splash__hex-outline"
            points="60,8 106,34 106,86 60,112 14,86 14,34"
          />
        </svg>

        <p className="boot-splash__kicker">Sunprint Atlas</p>
        <h1 className="boot-splash__wordmark">RunRealm</h1>
        <p className="boot-splash__tagline">Run. Claim. Defend.</p>

        {status === 'error' ? (
          <div className="boot-splash__error">
            <p className="boot-splash__error-text">
              Something interrupted the warm-up. Your realm is still here — take another run at it.
            </p>
            <button type="button" className="boot-splash__button" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="boot-splash__progress" aria-hidden="true">
              <span className="boot-splash__progress-fill" />
            </div>
            <p className="boot-splash__phase">{phase}</p>
            {slow && (
              <p className="boot-splash__hint">
                Still warming up — first visits load the atlas engine, territory chart and realm
                services.
              </p>
            )}
            {showSkip && (
              <button type="button" className="boot-splash__skip" onClick={onSkip}>
                Skip the intro
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<BootStatus>('loading');
  const [phase, setPhase] = useState('Waking the atlas');
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [slow, setSlow] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally restarts the boot sequence
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;
    let skipTimer: ReturnType<typeof setTimeout> | undefined;
    let slowTimer: ReturnType<typeof setTimeout> | undefined;

    setStatus('loading');
    setPhase('Waking the atlas');
    setShowSkip(false);
    setSlow(false);

    // The skip affordance appears once the splash has clearly begun; the
    // slow-boot hint explains a cold first visit instead of looking stuck.
    skipTimer = setTimeout(() => {
      if (mountedRef.current) setShowSkip(true);
    }, 2_500);
    slowTimer = setTimeout(() => {
      if (mountedRef.current) setSlow(true);
    }, 8_000);

    // If boot is quick, the splash still reads as intentional rather than a flash.
    const minSplash = new Promise<void>((resolve) => {
      phaseTimer = setTimeout(resolve, 900);
    });

    void (async () => {
      try {
        const { initializeApp } = await import('../lib/bootstrap');
        await initializeApp({
          onPhase: (label: string) => {
            if (mountedRef.current) {
              setPhase(label);
            }
          },
        });
        await minSplash;

        if (!mountedRef.current) return;
        setStatus('ready');
        hideTimer = setTimeout(() => {
          if (mountedRef.current) {
            setDismissed(true);
          }
        }, 600);
      } catch (error) {
        console.error('RunRealm bootstrap failed:', error);
        await minSplash;
        if (mountedRef.current) {
          setStatus('error');
        }
      }
    })();

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (phaseTimer) clearTimeout(phaseTimer);
      if (skipTimer) clearTimeout(skipTimer);
      if (slowTimer) clearTimeout(slowTimer);
    };
  }, [attempt]);

  const handleRetry = useCallback(() => {
    setStatus('loading');
    setPhase('Restarting the warm-up');
    setTimeout(() => {
      if (mountedRef.current) {
        setAttempt((n) => n + 1);
      }
    }, RETRY_COOLDOWN_MS);
  }, []);

  // Skipping only hides the splash; boot keeps running underneath. If it
  // later fails, the splash returns so the visitor is never left on a blank
  // page with no recovery path.
  const handleSkip = useCallback(() => {
    setDismissed(true);
  }, []);

  if (dismissed && status !== 'error') {
    return null;
  }

  return (
    <BootSplash
      status={status}
      phase={phase}
      showSkip={showSkip && status === 'loading'}
      slow={slow && status === 'loading'}
      onRetry={handleRetry}
      onSkip={handleSkip}
    />
  );
}
