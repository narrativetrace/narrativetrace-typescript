// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { hostileFeedbacks } from "../src/corpus/hostile-corpus.js";
import { mustBeRejected } from "../src/corpus/types.js";
import { resolveMasterFeedback } from "./master-corpus-path.js";

/**
 * `feedback.json`'s own shape as a contract, before any rule reads it.
 *
 * INTENT: this file is the cross-runtime master for the value-free gate — every runtime copies it
 * verbatim and reimplements only its reader — so a reader that silently dropped the `expect` or
 * the `rule` field would turn the whole replay suite green without deciding anything. The counts
 * are asserted because the two halves are both load-bearing: the rejected half is what the gate is
 * for, and the accepted half is what keeps it usable.
 */

const CORPUS_DIR = fileURLToPath(new URL("../hostile-corpus/", import.meta.url));

describe("the feedback corpus", () => {
  test("loads every row with the verdict it declares", () => {
    const rows = hostileFeedbacks();

    expect(rows).toHaveLength(77);
    expect(rows.filter((row) => !mustBeRejected(row))).toHaveLength(28);
    expect(rows.filter(mustBeRejected)).toHaveLength(49);
  });

  test("case identifiers are unique and every row says what breaks", () => {
    const rows = hostileFeedbacks();

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) expect(row.description).not.toBe("");
  });

  test("a rejected row names a rule and an accepted row names none", () => {
    for (const row of hostileFeedbacks()) {
      if (mustBeRejected(row)) expect(row.rule, row.id).toMatch(/^vf\./);
      else expect(row.rule, row.id).toBeUndefined();
    }
  });

  test("the escaped rows carry the code points they name", () => {
    const value = (id: string): string => {
      const found = hostileFeedbacks().find((row) => row.id === id);
      if (found === undefined) throw new Error(`no feedback corpus row with id ${id}`);
      return found.value;
    };

    expect(value("rendered-outcome-string")).toContain("→");
    expect(value("duration-milliseconds")).toContain("—");
    expect(value("control-nul")).toContain(String.fromCodePoint(0x0000));
    expect(value("control-bidi-override")).toContain(String.fromCodePoint(0x202e));
  });
});

/**
 * Cross-port rule §6.7, as `graphs.json` and `redaction.json` already apply it: this file is a
 * byte-identical copy of the master, compared at the master's committed `HEAD` and never at its
 * working tree. An absent master skips loudly — most checkouts have no sibling Java repo — rather
 * than passing silently, which reads the same as "checked and matched".
 */
const MASTER_FEEDBACK = resolveMasterFeedback();
if (MASTER_FEEDBACK === undefined) {
  console.warn(
    "SKIPPED: master corpus not mounted — set JAVA_REPO, or mount the canonical Java repo at " +
      "/workspace-java or check it out as a host sibling, to run the feedback.json " +
      "byte-diff-against-master check",
  );
}

describe.skipIf(MASTER_FEEDBACK === undefined)(
  "feedback.json byte-diff against the master corpus",
  () => {
    test(`the whole file matches the master copy byte-for-byte (${MASTER_FEEDBACK?.source})`, () => {
      const local = readFileSync(`${CORPUS_DIR}feedback.json`, "utf-8");
      expect(local).toBe((MASTER_FEEDBACK as NonNullable<typeof MASTER_FEEDBACK>).content);
    });
  },
);
