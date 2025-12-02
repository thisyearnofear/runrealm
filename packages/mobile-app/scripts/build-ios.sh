#!/usr/bin/env bash
set -euo pipefail

PROFILE=${PROFILE:-production}

echo "[RunRealm] Building iOS with EAS (profile=$PROFILE)"
echo "- Ensure EXPO_TOKEN is set if building on EAS CI"
echo "- Ensure Apple credentials are configured for the project"

if ! command -v eas >/dev/null 2>&1; then
  echo "error: 'eas' CLI not found. Install with: npm i -g eas-cli" >&2
  exit 1
fi

eas build --platform ios --profile "$PROFILE" --non-interactive

echo "[RunRealm] iOS build request submitted. Track status with: eas build:list"

