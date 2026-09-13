// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  CONTEXT_SOURCE_PATH,
  renderContextReferenceTable,
  syncNarrativeContextMembers,
} from "../context-reference-table.js";

const FIXTURE = `
export class Other {
  publicOnOther(): void {}
}

export class SyncNarrativeContext {
  readonly config: string;
  private secret: string;
  protected guarded(): void {}

  constructor(private readonly hidden: number) {}

  /** Pushes a frame and returns its handle. */
  enterMethod(className: string, methodName: string): number {
    return 0;
  }

  /**
   * How many times this context has been {@link reset}.
   *
   * @remarks Extra prose that never shows in the table.
   */
  get generation(): number {
    return 0;
  }

  reset(): void {}
}
`;

describe("syncNarrativeContextMembers", () => {
  it("includes public properties, getters, and methods, in declaration order", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.map((m) => m.name)).toEqual(["config", "enterMethod", "generation", "reset"]);
  });

  it("excludes private and protected members, the constructor, and constructor parameter properties", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    const names = members.map((m) => m.name);
    expect(names).not.toContain("secret");
    expect(names).not.toContain("guarded");
    expect(names).not.toContain("hidden");
    expect(names).not.toContain("constructor");
  });

  it("ignores a same-named member on a different class", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.map((m) => m.name)).not.toContain("publicOnOther");
  });

  it("renders a property's signature with its readonly modifier and type", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.find((m) => m.name === "config")?.signature).toBe("readonly config: string");
  });

  it("renders a method's signature with its parameters and return type", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.find((m) => m.name === "enterMethod")?.signature).toBe(
      "enterMethod(className: string, methodName: string): number",
    );
  });

  it("renders a getter's signature as get name(): Type", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.find((m) => m.name === "generation")?.signature).toBe(
      "get generation(): number",
    );
  });

  it("takes only the first line of a leading doc comment, resolving an inline {@link} tag", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.find((m) => m.name === "generation")?.summary).toBe(
      "How many times this context has been `reset`.",
    );
  });

  it("falls back to an em dash for a member with no leading doc comment", () => {
    const members = syncNarrativeContextMembers(FIXTURE);
    expect(members.find((m) => m.name === "config")?.summary).toBe("—");
  });

  it("reads the real class from disk when no source is passed", () => {
    // Pins the default wiring (CONTEXT_SOURCE_PATH) without duplicating the full member list —
    // that would drift with context.ts the same way the hand-typed doc block already had.
    expect(CONTEXT_SOURCE_PATH).toBe("packages/core/src/context.ts");
    expect(syncNarrativeContextMembers().length).toBeGreaterThan(20);
  });
});

describe("renderContextReferenceTable", () => {
  it("renders a two-column Markdown table, one row per member", () => {
    const table = renderContextReferenceTable(syncNarrativeContextMembers(FIXTURE));
    expect(table.split("\n")).toEqual([
      "| Member | Description |",
      "|---|---|",
      "| `readonly config: string` | — |",
      "| `enterMethod(className: string, methodName: string): number` | Pushes a frame and returns its handle. |",
      "| `get generation(): number` | How many times this context has been `reset`. |",
      "| `reset(): void` | — |",
    ]);
  });
});
