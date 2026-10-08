#!/usr/bin/env bash
# Runs the v1 done condition end to end. E2E_WEB / E2E_API pick targets (default local),
# E2E_HEADED=1 shows the browser, E2E_KEEP=1 skips `down`.
set -euo pipefail
cd "$(dirname "$0")/.."
CLI=./bin/verify-suppco
ENV_FILE="${VERIFY_SUPPCO_ENV:-$PWD/.env}"

if [ -z "${VERIFY_SUPPCO_EMAIL:-}" ] && [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi
: "${VERIFY_SUPPCO_EMAIL:?VERIFY_SUPPCO_EMAIL unset and not found in $ENV_FILE}"
: "${VERIFY_SUPPCO_CODE:?VERIFY_SUPPCO_CODE unset and not found in $ENV_FILE}"

names=(); codes=()
step() { # step <name> <cmd...>
  local name=$1; shift
  echo "=== $name" >&2
  local rc=0
  "$@" || rc=$?
  names+=("$name"); codes+=("$rc")
}

E2E_WEB=${E2E_WEB:-local}; E2E_API=${E2E_API:-local}
tgt=(--web "$E2E_WEB" --api "$E2E_API")

pw_flags=(--as "$VERIFY_SUPPCO_EMAIL" --trace)
[ "${E2E_HEADED:-}" = 1 ] && pw_flags+=(--headed)

step doctor "$CLI" doctor
step up "$CLI" up "${tgt[@]}"
step login "$CLI" login "${tgt[@]}"
step shot "$CLI" shot /home/today --as "$VERIFY_SUPPCO_EMAIL" "${tgt[@]}"
step pw "$CLI" pw examples/click-around.mjs "${tgt[@]}" "${pw_flags[@]}"
[ "${E2E_KEEP:-}" = 1 ] || step down "$CLI" down

echo >&2
fail=0
printf '%-8s %-6s %s\n' STEP RESULT EXIT >&2
for i in "${!names[@]}"; do
  r=PASS; [ "${codes[$i]}" -ne 0 ] && r=FAIL
  printf '%-8s %-6s %s\n' "${names[$i]}" "$r" "${codes[$i]}" >&2
  if [ "${names[$i]}" != doctor ] && [ "${codes[$i]}" -ne 0 ]; then fail=1; fi
done
exit $fail
