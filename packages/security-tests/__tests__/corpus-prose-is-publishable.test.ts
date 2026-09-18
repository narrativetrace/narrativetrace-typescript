// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { hostileGraphCases, hostileRedactions } from "../src/corpus/hostile-corpus.js";

/**
 * The corpus's own PROSE — the fields a reader reads, not the bytes a case plants — must be
 * publishable as it stands. Mirrors Java's `CorpusProseIsPublishableTest` (§6.7 guard).
 *
 * INTENT: The hostile corpus is the cross-port master copy: every runtime mirrors these files
 * byte-identically, and they ship in the public snapshot of each. A row written during private
 * work therefore carries that work's vocabulary straight into four public repositories — a commit
 * SHA nobody outside can resolve, or the name of an internal process — and the publish reference
 * gate rejects the mirrored file downstream, in a repository whose author cannot fix the text.
 * Catching it here, in the master copy (this file only replays the same check on the mirrored
 * copy), is the only place the fix is one edit rather than five.
 *
 * @llmNote Scans `id`, `kind`, `description` and `member` ONLY. The payload fields — a canary, a
 * value, a field name — are the hostile data itself: a national-id shape or a token fixture may
 * legitimately be a long run of hex digits, and a deny-list vocabulary row may legitimately name
 * any field an application ever declared. The prose fields are the ones written for a human, and
 * they are the ones that must read as a statement of the rule the row pins.
 *
 * @llmNote The hex rule is deliberately bounded at seven characters, the shortest abbreviated SHA
 * git resolves. Shorter runs — `cafe`, `dead`, a four-digit year — are ordinary English and
 * ordinary data.
 */

/** An abbreviated or full commit SHA: what a public reader cannot resolve. */
const COMMIT_SHA = /\b[0-9a-f]{7,40}\b/g;

/** Vocabulary of the private process, never of the rule a row pins. */
const PRIVATE_PROCESS = /pair\s*#|\bagent\b|\bcoordinator\b/gi;

function collectMatches(pattern: RegExp, field: string, offending: string[]): void {
  for (const match of field.matchAll(pattern)) offending.push(match[0]);
}

function assertProseIsPublishable(id: string, fields: readonly (string | undefined)[]): void {
  const offending: string[] = [];
  for (const field of fields) {
    if (field === undefined) continue;
    collectMatches(COMMIT_SHA, field, offending);
    collectMatches(PRIVATE_PROCESS, field, offending);
  }
  expect(
    offending,
    `${id}: corpus prose ships publicly and must name the rule, not the private work`,
  ).toEqual([]);
}

describe("corpus prose is publishable", () => {
  test("no graph row's prose carries a commit SHA or the vocabulary of the private process", () => {
    for (const graphCase of hostileGraphCases()) {
      assertProseIsPublishable(graphCase.id, [
        graphCase.id,
        graphCase.kind,
        graphCase.description,
        graphCase.member,
      ]);
    }
  });

  test("no redaction row's prose carries a commit SHA or the vocabulary of the private process", () => {
    for (const redactionCase of hostileRedactions()) {
      assertProseIsPublishable(redactionCase.id, [
        redactionCase.id,
        redactionCase.kind,
        redactionCase.description,
      ]);
    }
  });
});
