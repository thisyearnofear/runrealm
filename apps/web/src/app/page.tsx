'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type BootStatus = 'loading' | 'ready' | 'error';

const RETRY_COOLDOWN_MS = 1200;

function BootSplash({
  status,
  phase,
  onRetry,
}: {
  status: BootStatus;
  phase: string;
  onRetry: () => void;
}) {
  return (
    <output
      className={`boot-splash${status === 'ready' ? ' is-leaving' : ''}${
        status === 'error' ? ' boot-splash--error' : ''
      }`}
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
          </>
        )}
      </div>
    </output>
  );
}

export default function Home() {
  const [status, setStatus] = useState<BootStatus>('loading');
  const [phase, setPhase] = useState('Waking the atlas');
  const [attempt, setAttempt] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;

    setStatus('loading');
    setPhase('Waking the atlas');

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

  if (dismissed) {
    return null;
  }

  return <BootSplash status={status} phase={phase} onRetry={handleRetry} />;
}
