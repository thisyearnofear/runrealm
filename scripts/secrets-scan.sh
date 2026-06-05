#!/usr/bin/env bash
# Secrets scanner — used by lefthook pre-commit and pre-push hooks.
#
# Scans staged (or all source) files for hardcoded credentials and
# API keys. Catches:
#   - AWS access keys (AKIA...)
#   - GitHub personal access tokens (ghp_, gho_, ghs_, ghu_, github_pat_)
#   - OpenAI keys (sk-proj-, legacy sk-...T3BlbkFJ...)
#   - Anthropic keys (sk-ant-)
#   - Google API keys (AIza...)
#   - Stripe live keys (sk_live_, pk_live_, rk_live_)
#   - Slack tokens (xox[baprs]-)
#   - Mapbox tokens (pk.eyJ...)
#   - PEM private keys
#   - JWTs (eyJ.... . .... . ....)
#
# Designed to be fast, dependency-free, and not cry wolf on test
# fixtures, comments, or env-var references.
#
# Modes:
#   staged (default)  — files staged for commit
#   pushed            — files changed between HEAD and origin/main
#                       (use for pre-push; covers prior commits too)
#   all               — every tracked source file (slow on big monorepos)

set -uo pipefail

MODE="${1:-staged}"

# 0. Resolve the file list.
FILES=()
case "$MODE" in
  staged)
    while IFS= read -r f; do
      [ -n "$f" ] && FILES+=("$f")
    done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
    ;;
  pushed)
    # Files that exist in HEAD or working tree but differ from origin/main.
    # This catches secrets that landed in earlier commits without a hook.
    while IFS= read -r f; do
      [ -n "$f" ] && FILES+=("$f")
    done < <(git diff --name-only origin/main...HEAD 2>/dev/null \
      | grep -v -E '(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$')
    ;;
  all)
    while IFS= read -r f; do
      [ -n "$f" ] && FILES+=("$f")
    done < <(git ls-files \
      | grep -v -E '(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$')
    ;;
esac

if [ ${#FILES[@]} -eq 0 ]; then
  exit 0
fi

# 1. Allowlist patterns — these files are exempt. Use exact paths
#    or simple globs; keep the list small and intentional.
is_allowlisted() {
  local f="$1"
  case "$f" in
    # Build outputs, deps, vendored artifacts
    */node_modules/*|*/dist/*|*/build/*|*/.next/*|*/coverage/*) return 0 ;;
    */artifacts/*|*/cache/*|*/out/*) return 0 ;;
    # Test fixtures / mocks / snapshots
    */__tests__/*|*/__mocks__/*|*/__fixtures__/*) return 0 ;;
    *.test.ts|*.test.tsx|*.test.js|*.spec.ts|*.spec.tsx|*.spec.js) return 0 ;;
    *.snap) return 0 ;;
    # The scanner itself (contains the patterns it scans for)
    scripts/secrets-scan.sh) return 0 ;;
    # Documentation that intentionally shows redacted examples
    contracts/H3_MIGRATION.md|contracts/README.md) return 0 ;;
  esac
  return 1
}

# 2. A combined alternation regex used to scan each file in a single
#    grep pass. Faster than looping patterns per file. Per-label
#    classification happens after the match by checking which pattern
#    matched the line.
LABELS=(
  'aws-access-key'
  'github-pat'
  'github-oauth'
  'github-server'
  'github-user'
  'github-fine-grained'
  'openai-legacy'
  'openai-project'
  'anthropic'
  'google-api-key'
  'stripe-live-secret'
  'stripe-live-public'
  'stripe-live-restricted'
  'slack-token'
  'mapbox-public'
  'pem-private-key'
  'jwt'
)
# Order matters: more-specific patterns first so we tag correctly.
# Each pattern must include a unique sentinel that we strip before
# reporting — see classify_match().
COMBINED='(AKIA[0-9A-Z]{16})|(ghp_[A-Za-z0-9]{36})|(gho_[A-Za-z0-9]{36})|(ghs_[A-Za-z0-9]{36})|(ghu_[A-Za-z0-9]{36})|(github_pat_[A-Za-z0-9_]{82})|(sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})|(sk-proj-[A-Za-z0-9_-]{40,})|(sk-ant-[A-Za-z0-9_-]{40,})|(AIza[0-9A-Za-z_-]{35})|(sk_live_[A-Za-z0-9]{24,})|(pk_live_[A-Za-z0-9]{24,})|(rk_live_[A-Za-z0-9]{24,})|(xox[baprs]-[A-Za-z0-9-]{10,})|(pk\.eyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,})|(-----BEGIN [A-Z ]*PRIVATE KEY-----)|(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})'

# 3. Lines that look like a key but are actually env-var references
#    or type annotations get skipped. Anything containing these
#    substrings on the same line as a match is treated as a non-finding.
SAFE_CONTEXTS=(
  'process.env.'
  'import.meta.env.'
  'env:'
  'ENV '
  'TODO'
  'FIXME'
  'redact'
  'placeholder'
  'example'
  '// '
  '# '
  '/* '
  ' * '
)

is_safe_context() {
  local line="$1"
  for ctx in "${SAFE_CONTEXTS[@]}"; do
    if [[ "$line" == *"$ctx"* ]]; then
      return 0
    fi
  done
  return 1
}

# Map a matched token to its label by checking which label's pattern
# matches it. Order matches COMBINED above.
classify_match() {
  local m="$1"
  case "$m" in
    AKIA*) echo 'aws-access-key' ;;
    ghp_*) echo 'github-pat' ;;
    gho_*) echo 'github-oauth' ;;
    ghs_*) echo 'github-server' ;;
    ghu_*) echo 'github-user' ;;
    github_pat_*) echo 'github-fine-grained' ;;
    sk-*T3BlbkFJ*) echo 'openai-legacy' ;;
    sk-proj-*) echo 'openai-project' ;;
    sk-ant-*) echo 'anthropic' ;;
    AIza*) echo 'google-api-key' ;;
    sk_live_*) echo 'stripe-live-secret' ;;
    pk_live_*) echo 'stripe-live-public' ;;
    rk_live_*) echo 'stripe-live-restricted' ;;
    xox[baprs]-*) echo 'slack-token' ;;
    pk.eyJ*) echo 'mapbox-public' ;;
    -----BEGIN*) echo 'pem-private-key' ;;
    eyJ*) echo 'jwt' ;;
    *) echo 'unknown' ;;
  esac
}

# 4. Scan.
findings=0
scanned=0
for file in "${FILES[@]}"; do
  if is_allowlisted "$file"; then continue; fi
  if [ ! -f "$file" ]; then continue; fi

  # Skip binary files by extension.
  case "$file" in
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.webp|*.pdf|*.zip|*.tar|*.gz|*.woff|*.woff2|*.ttf|*.otf|*.mp4|*.mov|*.mp3|*.wasm) continue ;;
  esac

  scanned=$((scanned + 1))
  while IFS=: read -r line_no match; do
    [ -z "$match" ] && continue
    # The line content (for context check). Reconstruct from the file
    # using sed; cheaper than loading the whole file into memory.
    full_line=$(sed -n "${line_no}p" "$file" 2>/dev/null || true)
    if is_safe_context "$full_line"; then continue; fi
    label=$(classify_match "$match")
    # Truncate the match in the report so we don't echo the secret.
    preview="${match:0:12}…"
    printf '  ❌ %s:%s  [%s]  %s\n' "$file" "$line_no" "$label" "$preview" >&2
    findings=$((findings + 1))
  done < <(grep -nE -o -e "$COMBINED" -- "$file" 2>/dev/null || true)
done

if [ "$findings" -gt 0 ]; then
  printf '\n%s secret-like pattern(s) found across %s file(s).\n' "$findings" "$scanned" >&2
  printf 'If a finding is a false positive (test fixture, example doc, etc.):\n' >&2
  printf '  - Move the line to a file matching scripts/secrets-scan.sh allowlist\n' >&2
  printf '  - Or wrap the value in process.env. / import.meta.env.\n' >&2
  printf '  - Or add the file to the allowlist in scripts/secrets-scan.sh\n' >&2
  exit 1
fi

exit 0

