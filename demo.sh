#!/usr/bin/env bash
# SPDX-License-Identifier: BUSL-1.1
# Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
# Copyright (c) 2026 Empower Agile
# NarrativeTrace demo launcher — one command, the trace story front and center.
#
#   ./demo.sh                          interactive example picker
#   ./demo.sh ecommerce                non-interactive shorthand for --example ecommerce
#   ./demo.sh --example ecommerce      same, spelled out
#   ./demo.sh --example ecommerce --classic     the same run as timestamped logs (winston)
#   ./demo.sh --example ecommerce --no-pause    play straight through, no stop points
#   ./demo.sh --example ecommerce --lang es     re-render the same run through the example's glossary.json
#   ./demo.sh --list                   list the examples this launcher can run, and what it cannot
#
# On a terminal the demo stops after each scenario — [Enter] continues, q quits — and every
# scenario opens with a note on how its trace is wired. --lang es|zh-CN re-renders the SAME
# recorded run through the example's committed glossary.json: identifiers get glossed, values
# stay byte-identical, and untranslated phrases land in a "Glossary gaps" footer. The picker
# offers only the languages the example's own glossary actually carries.
#
# Every run also streams the same trace to a real logger (a pino consumer, documentation/
# framework-integration-guide.md § 9), written to demo-trace.log so the picker's colors stay
# readable — tail -f demo-trace.log in another terminal to watch it land.
set -euo pipefail
cd "$(dirname "$0")"

usage() {
  # 2..20 is the header comment block; 21 is `set -euo pipefail`, which a wider
  # range would print as the trailing line of --help.
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
}

# The four examples with a committed glossary.json (schemaVersion 1: terms carry per-locale
# "translations") — the only ones this launcher can walk scenario by scenario AND re-render
# through --lang, because that is what the launcher's engine (tools/demo.ts) implements.
EXAMPLES=(ecommerce clarity minecraft plain-js)

# Everything else under examples/ that this launcher does not offer, and why: a server left
# waiting for requests, a page waiting for a click, or a package already shown above under a
# different name. Printed on --list and before the interactive picker — never silently dropped.
EXCLUDED=(
  "browser|opens a page and needs a button click — run 'pnpm run example:browser' and click it"
  "express|starts an HTTP server and waits for requests — run 'pnpm run example:express' directly"
  "hono|starts an HTTP server and waits for requests — run 'pnpm run example:hono' directly"
  "script-tag|starts an HTTP server and needs a button click — run 'pnpm run example:script-tag' and click it"
  "express-angular|starts a server and a browser dev client together — run 'pnpm run example:express-angular' directly"
  "nestjs-react|starts a server and a browser dev client together — see examples/nestjs-react/package.json"
  "distributed|a multi-service Docker Compose stack — run 'pnpm run example:distributed' (needs Docker)"
  "minecraft-generic|shown together with minecraft above, as its unrefactored half"
)

print_excluded() {
  echo "Not offered here (need a browser or a running server, not a headless trace):"
  local entry
  for entry in "${EXCLUDED[@]}"; do
    printf '  %-16s %s\n' "${entry%%|*}" "${entry#*|}"
  done
}

example=""
lang=""
lang_set=0
classic=0
no_pause=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) shift ;;
    -e|--example) example="${2:?--example needs a value}"; shift 2 ;;
    --lang) lang="${2:?--lang needs a value}"; lang_set=1; shift 2 ;;
    --classic) classic=1; shift ;;
    --no-pause) no_pause=1; shift ;;
    --list)
      printf '%s\n' "${EXAMPLES[@]}"
      echo
      print_excluded
      exit 0
      ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) example="$1"; shift ;;
  esac
done

is_valid_example() {
  local candidate
  for candidate in "${EXAMPLES[@]}"; do
    [[ "$candidate" == "$1" ]] && return 0
  done
  return 1
}

excluded_reason() {
  local entry
  for entry in "${EXCLUDED[@]}"; do
    if [[ "${entry%%|*}" == "$1" ]]; then
      printf '%s\n' "${entry#*|}"
      return 0
    fi
  done
  return 1
}

if [[ -n "$example" ]]; then
  reason=""
  if reason=$(excluded_reason "$example"); then
    echo "'$example' is not offered here: $reason" >&2
    exit 2
  fi
  if ! is_valid_example "$example"; then
    echo "unknown example: $example (try --list)" >&2
    exit 2
  fi
fi

# No example yet and a human is about to be asked: say what is missing from the list before
# the picker below shows it, so its absence never reads as an oversight.
if [[ -z "$example" && -t 0 ]]; then
  print_excluded
  echo
fi

# Resolving `pnpm` itself: turbo (the build step below) shells out to it per package, so it
# must be on PATH, not merely resolvable through `npx`. A container or CI image with corepack
# already enabled hits the first branch; a bare host falls back to a pinned, ephemeral pnpm.
run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  else
    npx --yes corepack@latest pnpm "$@"
  fi
}

# Waits for a background child, animating a braille spinner on a TTY (pipes and CI just wait
# quietly). Ctrl-C kills the child rather than orphaning it. Returns the child's exit status
# so the caller can show the buffered log only on failure.
await() {
  local pid="$1" message="$2" frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0
  trap 'kill "$pid" 2>/dev/null; printf "\n"; exit 130' INT
  if [[ -t 1 ]]; then
    while kill -0 "$pid" 2>/dev/null; do
      printf '\r%s %s' "${frames:i++%10:1}" "$message"
      sleep 0.1
    done
  fi
  trap - INT
  wait "$pid"
}

# A fresh clone has no node_modules — turbo, tsx and every dependency arrive only with
# install. Detect that state and install first (frozen lockfile: the demo must run exactly
# what the repo pins, never resolve anew), so `./demo.sh` works as the FIRST command a
# visitor runs, not the third.
install_workspace() {
  [[ -d node_modules ]] && return
  local log
  if [[ ! -t 1 ]]; then
    echo "Installing dependencies (first run only)..."
    run_pnpm install --frozen-lockfile >/dev/null
    return
  fi
  log=$(mktemp)
  run_pnpm install --frozen-lockfile >"$log" 2>&1 &
  if await $! "Installing dependencies (first run only)..."; then
    printf '\r✔ Dependencies installed.                                      \n'
    rm -f "$log"
  else
    printf '\r✖ Install failed:                                              \n'
    cat "$log"
    exit 1
  fi
}

# The launcher's engine (tools/demo.ts) imports every package's built `dist/`, not its source —
# same reason Java's launcher builds before it runs. turbo caches per package, so this is a
# real build exactly once; every run after that is a cache hit.
build_workspace() {
  local log
  if [[ ! -t 1 ]]; then
    echo "Building the workspace (turbo, cached after the first run)..."
    run_pnpm run build >/dev/null
    return
  fi
  log=$(mktemp)
  run_pnpm run build >"$log" 2>&1 &
  if await $! "Building the workspace (turbo, cached after the first run)..."; then
    printf '\r✔ Workspace built.                                             \n'
    rm -f "$log"
  else
    printf '\r✖ Build failed:                                                \n'
    cat "$log"
    rm -f "$log"
    exit 1
  fi
}
install_workspace
build_workspace

# Everything past this point — the example/language pickers when a flag is missing, the
# gating of --lang against the example's committed glossary.json, the paced walk, --classic
# and the translated re-render — is the launcher's engine; this script only builds and hands
# off to it with the flags it already understands.
args=()
[[ -n "$example" ]] && args+=(--example "$example")
[[ "$lang_set" == 1 ]] && args+=(--lang "$lang")
[[ "$classic" == 1 ]] && args+=(--classic)
[[ "$no_pause" == 1 ]] && args+=(--no-pause)

# `"${args[@]}"` on a zero-element array is an unbound-variable error under `set -u` in bash
# 3.2 (macOS's default) — the length check below is the portable guard, not a style choice.
if [[ "${#args[@]}" -gt 0 ]]; then
  exec npx tsx tools/demo.ts "${args[@]}"
else
  exec npx tsx tools/demo.ts
fi
