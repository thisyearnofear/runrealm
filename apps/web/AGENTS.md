<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Neighbourhood slice — verification commands

Shared core tests (run from repo root; shared tests execute inside the workspace):

```bash
cd packages/shared-core && npx jest \
  services/__tests__/neighbourhood-service.test.ts \
  services/__tests__/territory-auto-claim.test.ts \
  services/__tests__/run-tracking-gps.test.ts \
  services/__tests__/run-tracking-checkpoint.test.ts \
  services/__tests__/run-tracking-history.test.ts --forceExit
```

Web shell tests:

```bash
cd apps/web && npx jest \
  src/shell/components/__tests__/neighbourhood-experience.test.ts \
  src/shell/components/__tests__/recovered-run-card.test.ts \
  src/shell/components/__tests__/run-theater-wake.test.ts --forceExit
```

Gates: `npm run build:shared` (required before browser — web resolves `@runrealm/*` to `dist/`), `cd apps/web && npx tsc --noEmit`, `npm run check:globals`, `npm run check:singletons`, `node_modules/.bin/biome check <changed files>`.

Browser QA uses `agent-browser --session runrealm-neighbourhood-qa` with `--init-script` stubbing `navigator.geolocation` (the real `watchPosition` watcher path feeds `location:changed` — do not emit the event directly). Close with `agent-browser close --session runrealm-neighbourhood-qa` only.
