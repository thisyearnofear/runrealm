#!/usr/bin/env bash
set -euo pipefail

echo "[RunRealm] Submitting iOS build to App Store Connect"
echo "- Requires a completed build (use: eas build --platform ios)"
echo "- Ensure Apple credentials are configured (APPLE_ID, ASC_APP_ID)"

if ! command -v eas >/dev/null 2>&1; then
  echo "error: 'eas' CLI not found. Install with: npm i -g eas-cli" >&2
  exit 1
fi

ARGS=(--platform ios --non-interactive --skip-build)

if [[ -n "${APPLE_ID:-}" ]]; then
  ARGS+=(--apple-id "$APPLE_ID")
fi

if [[ -n "${ASC_APP_ID:-}" ]]; then
  ARGS+=(--asc-app-id "$ASC_APP_ID")
fi

eas submit "${ARGS[@]}"

echo "[RunRealm] iOS submit command finished. Check App Store Connect for processing status."

