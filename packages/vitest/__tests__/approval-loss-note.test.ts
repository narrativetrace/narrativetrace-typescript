// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { approvalLossNote } from "../src/approval-loss-note.js";

describe("approvalLossNote", () => {
  it("is undefined for a clean capture (no shedding at all)", () => {
    expect(approvalLossNote(undefined)).toBeUndefined();
  });

  it("is undefined when shedding carries no loss", () => {
    expect(approvalLossNote({ shedEvents: 0, capacity: 8192 })).toBeUndefined();
  });

  it("names a single dropped event in the singular", () => {
    expect(approvalLossNote({ shedEvents: 1, capacity: 8192 })).toBe("1 event dropped");
  });

  it("names multiple dropped events in the plural", () => {
    expect(approvalLossNote({ shedEvents: 3, capacity: 8192 })).toBe("3 events dropped");
  });

  it("names a single refused async scope in the singular", () => {
    expect(approvalLossNote({ shedEvents: 0, capacity: 8192, refusedScopes: 1 })).toBe(
      "1 async scope refused",
    );
  });

  it("names multiple refused async scopes in the plural", () => {
    expect(approvalLossNote({ shedEvents: 0, capacity: 8192, refusedScopes: 2 })).toBe(
      "2 async scopes refused",
    );
  });

  it("joins both kinds of loss when both occurred", () => {
    expect(approvalLossNote({ shedEvents: 1, capacity: 8192, refusedScopes: 2 })).toBe(
      "1 event dropped, 2 async scopes refused",
    );
  });
});
