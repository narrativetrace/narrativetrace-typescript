// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runApproveNarratives } from "../src/approve-narratives-cli.js";

describe("runApproveNarratives", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "nt-approve-cli-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("logs that there is nothing to approve for an empty (or nonexistent) directory", () => {
    const logs: string[] = [];
    runApproveNarratives(join(root, "does-not-exist"), { log: (m) => logs.push(m) });
    expect(logs).toEqual(["No received traces to approve."]);
  });

  test("promotes every received trace found anywhere under the root, logging each", () => {
    const dirA = join(root, "Svc");
    const dirB = join(root, "nested", "Other");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirA, "run.received.nt"), "scenario: x\n\n- Svc.run()\n");
    writeFileSync(join(dirB, "op.received.nt"), "scenario: y\n\n- Other.op()\n");
    // Not a received trace — must survive untouched.
    writeFileSync(join(dirA, "run.approved.nt"), "scenario: x\n\n- Svc.run()\n");

    const logs: string[] = [];
    runApproveNarratives(root, { log: (m) => logs.push(m) });

    expect(logs).toHaveLength(2);
    expect(logs.every((line) => line.startsWith("Approved: "))).toBe(true);
    expect(readdirSync(dirA).sort()).toEqual(["run.approved.nt"]);
    expect(readdirSync(dirB)).toEqual(["op.approved.nt"]);
  });

  test("defaults to console.log when no io is injected", () => {
    expect(() => runApproveNarratives(join(root, "empty"))).not.toThrow();
  });
});
