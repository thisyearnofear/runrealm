'use client';

import dynamic from 'next/dynamic';

const AppShell = dynamic(() => import('./AppShell').then((mod) => mod.AppShell), {
  ssr: false,
  loading: () => (
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
  ),
});

export function RunRealmPage() {
  return <AppShell runState={null} tokenBalance="0" anchoredTerritoryIds={[]} />;
}
