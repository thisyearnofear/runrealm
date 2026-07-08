'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function start() {
      try {
        const { initializeApp } = await import('../lib/bootstrap');
        await initializeApp();
      } catch (err) {
        console.error('RunRealm bootstrap failed:', err);
      } finally {
        if (mounted) setReady(true);
      }
    }
    void start();
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a1a',
          color: '#fff',
        }}
      >
        Loading RunRealm…
      </div>
    );
  }

  return null;
}
