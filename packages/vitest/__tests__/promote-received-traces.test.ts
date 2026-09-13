// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  approvedPathOf,
  type PromoteIo,
  promoteReceivedTraces,
} from "../src/promote-received-traces.js";

function fakeIo(files: readonly string[]): PromoteIo & { renamed: [string, string][] } {
  const renamed: [string, string][] = [];
  return {
    renamed,
    listReceivedTraces: () => files,
    rename: (from, to) => renamed.push([from, to]),
  };
}

describe("approvedPathOf", () => {
  it("swaps the .received.nt suffix for .approved.nt", () => {
    expect(approvedPathOf("narratives/Svc/run.received.nt")).toBe("narratives/Svc/run.approved.nt");
  });
});

describe("promoteReceivedTraces", () => {
  it("returns empty and renames nothing when there is nothing to promote", () => {
    const io = fakeIo([]);
    expect(promoteReceivedTraces("narratives", io)).toEqual([]);
    expect(io.renamed).toHaveLength(0);
  });

  it("renames every received trace to its approved sibling and returns the approved paths", () => {
    const io = fakeIo(["narratives/A/run.received.nt", "narratives/B/other.received.nt"]);
    const promoted = promoteReceivedTraces("narratives", io);
    expect(promoted.sort()).toEqual(
      ["narratives/A/run.approved.nt", "narratives/B/other.approved.nt"].sort(),
    );
    expect(io.renamed).toContainEqual([
      "narratives/A/run.received.nt",
      "narratives/A/run.approved.nt",
    ]);
  });
});
