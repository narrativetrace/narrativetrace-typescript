// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Coverage-guided fuzzing (`pnpm run fuzz`), budgeted per target — the scheduled/manual CI
 * job, distinct from `pnpm run check`'s regression-replay (`__tests__/fuzz-regression.test.ts`,
 * which needs no native addon and runs everywhere).
 *
 * INTENT: mirrors Java's `FuzzBudget.PER_TARGET` — one place the schedule's cost is written
 * down, referenced by every target rather than repeated per invocation.
 *
 * @llmNote Jazzer.js's `@jazzer.js/fuzzer` is a native addon (libFuzzer bindings via
 * cmake-js) with a documented, narrower support matrix than plain Node.js: "Linux x86_64,
 * macOS x86_64 and arm64, Windows x86_64" (Jazzer.js README, "Supported Architectures" —
 * Linux **arm64 is not listed**). This container is linux/arm64, verified via
 * `uname -a` → `aarch64`, so this script degrades to a clear, non-failing report instead of
 * attempting an install `pnpm run check` cannot perform anyway (no network-based `pnpm
 * install` inside this container). Real fuzzing runs on the repository's own scheduled
 * fuzz workflow, on a hosted `ubuntu-latest` runner (x86_64) — the addon ships a
 * `fuzzer-linux-x64.node` prebuild (checked into the npm package, no compile step needed),
 * so that job runs the real fuzzer, not this degrade. Verified 2026-09-09: no such job
 * existed anywhere before that date, despite this comment's previous wording claiming one
 * did — see that workflow's own header comment for the correction and the full account.
 */
const PER_TARGET_SECONDS = 5 * 60;

const TARGETS = [
  {
    name: "value-renderer",
    entry: "fuzz/value-renderer.fuzz.mjs",
    corpus: "fuzz-seeds/value-renderer",
  },
  {
    name: "output-format-json",
    entry: "fuzz/output-format-json.fuzz.mjs",
    corpus: "fuzz-seeds/output-format-json",
  },
];

const SUPPORTED = new Set(["linux-x64", "darwin-x64", "darwin-arm64", "win32-x64"]);

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

function reportUnsupportedPlatform(): void {
  console.log(
    [
      `Tier B (coverage-guided fuzzing) skipped: ${platformKey()} is not in Jazzer.js's`,
      "supported-architecture list (Linux x86_64, macOS x86_64/arm64, Windows x86_64 — see",
      "https://github.com/CodeIntelligenceTesting/jazzer.js#readme).",
      "The regression-replay half of Tier B still runs everywhere: `pnpm run check` replays",
      "every seed under fuzz-seeds/ through both targets via __tests__/fuzz-regression.test.ts.",
      "Real coverage-guided fuzzing runs on .github/workflows/fuzz.yml's scheduled/manual",
      "job (GitHub's ubuntu-latest runner is x86_64) — see that file for how to watch a run.",
    ].join("\n"),
  );
}

function jazzerAvailable(): boolean {
  return existsSync(new URL("../node_modules/.bin/jazzer", import.meta.url));
}

function reportMissingJazzer(): void {
  console.log(
    "Tier B skipped: @jazzer.js/core is not installed in this workspace.\n" +
      "Add it as a devDependency (`pnpm add -D @jazzer.js/core --filter @narrativetrace/security-tests`)\n" +
      "on a supported platform, then re-run `pnpm run fuzz`.",
  );
}

function runTarget(target: (typeof TARGETS)[number]): boolean {
  console.log(`\n=== fuzzing ${target.name} for ${PER_TARGET_SECONDS}s ===`);
  const result = spawnSync(
    "npx",
    ["jazzer", target.entry, target.corpus, "--", `-max_total_time=${PER_TARGET_SECONDS}`],
    { stdio: "inherit" },
  );
  return result.status === 0;
}

function main(): void {
  if (!SUPPORTED.has(platformKey())) {
    reportUnsupportedPlatform();
    return;
  }
  if (!jazzerAvailable()) {
    reportMissingJazzer();
    return;
  }
  const results = TARGETS.map(runTarget);
  if (results.some((ok) => !ok)) process.exit(1);
}

main();
