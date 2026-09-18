// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { resolveMasterGraphs } from "./master-corpus-path.js";

/**
 * Proves the design-flaw fix (§6.7): the byte-identity check reads the master's COMMITTED `HEAD`,
 * never its working tree. Without this, an in-progress edit sitting uncommitted in a live master
 * checkout — the master repo can be worked on the same host, the same day, as this port — would
 * turn this port red before that edit ever landed anywhere.
 *
 * INTENT: dirty a real master repo's `graphs.json` and show the resolver stays green anyway — but
 * never touch the actual master. A local, shallow `git clone` of the real master repo into a
 * scratch temp directory gives an independent working tree with its own `HEAD`; the dirty edit
 * lands only there. `JAVA_REPO` (the same override `master-corpus-path.ts` already reads) is
 * pointed at the scratch clone for the duration of one test, then restored.
 */
const JAVA_REPO_ENV = "JAVA_REPO";
const CANONICAL_REPO_DIR_NAME = "narrative-trace-java";
const WORKSPACE_MOUNT = "/workspace-java";
const HOSTILE_CORPUS_RELATIVE_DIR =
  "narrativetrace-security-tests/src/test/resources/hostile-corpus";

/** Same search order as `master-corpus-path.ts`'s own resolver — finds a real master checkout to
 * clone FROM, independent of whatever `JAVA_REPO` this test itself is about to override. */
function findRealMasterRepo(): string | undefined {
  const hostSibling = join(import.meta.dirname, "..", "..", "..", "..", CANONICAL_REPO_DIR_NAME);
  for (const candidate of [process.env[JAVA_REPO_ENV], WORKSPACE_MOUNT, hostSibling]) {
    if (candidate !== undefined && existsSync(join(candidate, ".git"))) return candidate;
  }
  return undefined;
}

const REAL_MASTER_REPO = findRealMasterRepo();
if (REAL_MASTER_REPO === undefined) {
  console.warn(
    "SKIPPED: no real master git checkout found (set JAVA_REPO, mount /workspace-java, or check " +
      "out narrative-trace-java as a host sibling) — the HEAD-vs-working-tree proof needs one to " +
      "clone from",
  );
}

/** Shallow-clones the real master repo into `dest`, then dirties the CLONE's `graphs.json` working
 * tree (never the real master, never committed) — returns both bytes so the test can tell them
 * apart. */
function cloneAndDirtyMasterGraphs(dest: string): {
  readonly absolutePath: string;
  readonly committedContent: string;
  readonly dirtiedContent: string;
} {
  // `file://` (not a bare path) so `--depth` actually takes effect instead of being silently
  // ignored — git treats a bare local path as a "local clone" it always does in full.
  execFileSync("git", ["clone", "--depth", "1", `file://${REAL_MASTER_REPO as string}`, dest]);
  const absolutePath = join(dest, `${HOSTILE_CORPUS_RELATIVE_DIR}/graphs.json`);
  const committedContent = readFileSync(absolutePath, "utf-8");
  const dirtiedContent = `${committedContent}\n// DELIBERATELY DIRTIED FOR THE RESOLVER PROOF\n`;
  writeFileSync(absolutePath, dirtiedContent, "utf-8");
  return { absolutePath, committedContent, dirtiedContent };
}

describe.skipIf(REAL_MASTER_REPO === undefined)(
  "resolveMasterGraphs reads committed HEAD, never a dirty working tree",
  () => {
    let scratchDir: string | undefined;
    let savedJavaRepoEnv: string | undefined;

    afterEach(() => {
      if (savedJavaRepoEnv === undefined) delete process.env[JAVA_REPO_ENV];
      else process.env[JAVA_REPO_ENV] = savedJavaRepoEnv;
      if (scratchDir !== undefined) rmSync(scratchDir, { recursive: true, force: true });
      scratchDir = undefined;
    });

    // A real `git clone` to disk, not a fixture walk, but the same wall-clock exposure: measured
    // ~1000ms run alone in the dev container, comfortably past vitest's implicit 5000ms default
    // under the clone I/O contention a full concurrent coverage sweep puts on the container.
    // Release retrospective rule 3 says that budget must never be implicit — a test whose
    // legitimate cost varies with scheduler and I/O contention declares what it actually needs,
    // and a hang guard on a non-timing test takes a seconds-scale floor, never a millisecond-scale
    // tolerance close enough to the measured run to mistake ordinary contention for a hang.
    test("a dirtied scratch clone still resolves the committed content, never the dirty bytes", () => {
      scratchDir = mkdtempSync(join(tmpdir(), "nt-corpus-head-proof-"));
      const { absolutePath, committedContent, dirtiedContent } =
        cloneAndDirtyMasterGraphs(scratchDir);

      savedJavaRepoEnv = process.env[JAVA_REPO_ENV];
      process.env[JAVA_REPO_ENV] = scratchDir;
      const resolved = resolveMasterGraphs();

      // The property under test: HEAD-comparison stays green (resolves the committed content, not
      // the dirty bytes on disk) — a working-tree comparison, reading `absolutePath` directly as
      // the old resolver did, would have returned `dirtiedContent` here instead and gone red.
      expect(resolved?.content).toBe(committedContent);
      expect(resolved?.content).not.toBe(dirtiedContent);
      expect(readFileSync(absolutePath, "utf-8")).toBe(dirtiedContent);
      expect(resolved?.source).toMatch(/^HEAD \(/);
    }, 10_000);
  },
);
