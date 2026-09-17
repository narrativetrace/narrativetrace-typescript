// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Runs a command and fails if it left anything behind in the working tree.
//
// 2026-09-17, mirrored from a Python-port finding (a test asked "is a docs sync pending?" by
// calling the function that PERFORMS the sync, so under mutation it rewrote tracked pages): a
// suite that writes where the repository lives is not a test, it is an unreviewed edit. The
// question a check asks must be answerable without writing — the `--check`/`--fix` pairs in this
// repo (`license-header`, `skills-render`, `promotion-render-cli`, `context-reference-render-cli`,
// `snippet-check`) already split that way, and this is what keeps the split honest for every test
// and every tool a test reaches, including ones nobody has written yet.
//
// Wraps the gate's own test commands rather than running a second suite of its own, so it costs
// one `git status` per wrapped command. Ignored paths (`narrativetrace-output/`, `coverage/`,
// `reports/`) never appear in `git status --porcelain`, which is exactly right: a test IS allowed
// to write its own output directory, and is not allowed to touch anything the repository tracks.
//
// Never skips. `git` missing is a failure, not a pass (release rule 2, 2026-09-07: a tool that
// gracefully skips must be able to prove it ever ran).
//
// Plain ESM, like `mutation-workers.mjs`: spawned by plain Node from a package script.

import { spawn, spawnSync } from "node:child_process";

/**
 * The `git status --porcelain` lines `after` has that `before` did not — the working-tree changes
 * the wrapped command is responsible for. Whole lines, so a path whose status changed (untracked
 * becoming modified, say) still reads as new. Pure.
 */
export function newWorkingTreeEntries(before, after) {
  const seen = new Set(before);
  return after.filter((line) => !seen.has(line));
}

/** The failure report: what ran, what it wrote, and what to do about it. */
export function reportLines(command, entries) {
  return [
    `tree-writes-guard: \`${command}\` changed ${entries.length} path(s) in the working tree:`,
    ...entries.map((line) => `  ${line}`),
    "A test must answer its question without writing where the repository lives. Make the",
    "'ask' half read-only, or take the output root as a parameter and point it at a temp dir.",
  ];
}

/** `git status --porcelain` as lines. Throws rather than skipping when git cannot answer. */
export function workingTreeStatus() {
  const result = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (result.error) throw new Error(`tree-writes-guard: cannot run git — ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`tree-writes-guard: git status exited ${result.status}\n${result.stderr}`);
  }
  return result.stdout.split("\n").filter((line) => line.length > 0);
}

function finish(command, before, commandStatus) {
  const written = newWorkingTreeEntries(before, workingTreeStatus());
  if (written.length > 0) {
    for (const line of reportLines(command, written)) console.error(line);
    process.exit(1);
  }
  process.exit(commandStatus);
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error("Usage: node tools/tree-writes-guard.mjs <command> [args...]");
    process.exit(1);
  }
  const before = workingTreeStatus();
  const child = spawn(command, args, { stdio: "inherit" });
  child.on("error", (error) => {
    console.error(`tree-writes-guard: could not start \`${command}\` — ${error.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) =>
    finish([command, ...args].join(" "), before, signal ? 1 : (code ?? 1)),
  );
}

if (process.argv[1]?.endsWith("tree-writes-guard.mjs")) main(process.argv.slice(2));
