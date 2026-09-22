# RunRealm Web

Next.js shell for the RunRealm living map.

## Canonical direction

This app implements **Sunprint Atlas**:

- runs expose the world;
- routes appear as chalk/light traces;
- H3 claims develop into territory;
- vulnerable cells overexpose;
- Orbis supplies reactive generated atmosphere, while MapLibre/deck.gl remain the authoritative game surface.

Do not introduce generic neon-dark dashboard styling. Read
[`docs/design-improvement-plan.md`](../../docs/design-improvement-plan.md)
before changing map, motion, tokens, or Orbis behavior.

## Commands

Run from the repository root:

```bash
npm run dev:web
npm run build:web
npm run test --workspace=@runrealm/web
```

The app is configured as a static Next export. Public runtime flags use
`NEXT_PUBLIC_*` and are bridged in `src/lib/env.ts`. Server-only keys such as
`REACTOR_API_KEY` must never be bridged into `__ENV__` or exposed through a
`NEXT_PUBLIC_*` variable.

## Orbis Live

`/orbis-live/` is the wallet-free Visko Orbis challenge slice. Storyboard mode
works without credentials. For live video, run the backend token broker and
point the static web app at it:

```bash
PORT=3001 REACTOR_API_KEY=rk_your_key_here npm run dev:backend
NEXT_PUBLIC_ENABLE_ORBIS=true \
NEXT_PUBLIC_REACTOR_TOKEN_URL=http://localhost:3001/api/reactor/token \
npm run dev:web
```

See [`docs/orbis-live.md`](../../docs/orbis-live.md) for the event flow,
Netlify function, token scope, and judging notes.

## Key files

- `src/app/layout.tsx` — persistent map container
- `src/lib/bootstrap.ts` — application composition/bootstrap
- `src/lib/env.ts` — public environment bridge
- `src/styles/design-tokens.css` — Sunprint Atlas CSS tokens
- `src/styles/core-system.css` — legacy compatibility plus global guards

