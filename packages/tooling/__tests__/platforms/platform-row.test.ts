// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { MANUAL_LANE, type PlatformRow, platformRow } from "../../src/platforms/platform-row.js";

function valid(overrides: Partial<PlatformRow> = {}): PlatformRow {
  return {
    id: "some-platform",
    name: "Name",
    markerPaths: [".some"],
    pointer: { kind: "none", path: "" },
    installPath: "install",
    agentFinds: "finds",
    evidenceLane: "manual",
    verified: "2026-10-10",
    ...overrides,
  };
}

describe("a platform row", () => {
  test("a well-formed row is built", () => {
    expect(platformRow(valid()).id).toBe("some-platform");
  });

  test("an id must be kebab-case", () => {
    expect(() => platformRow(valid({ id: "Some_Platform" }))).toThrow(/kebab-case/);
  });

  test("a row with no marker path could never be detected", () => {
    expect(() => platformRow(valid({ markerPaths: [] }))).toThrow(/no marker path/);
  });

  test("a verification date must be a date", () => {
    expect(() => platformRow(valid({ verified: "last week" }))).toThrow(/yyyy-mm-dd/);
  });

  test("a marker path must be a real, project-relative path", () => {
    for (const marker of ["", " ", "/etc", "../x", "a/../../b"]) {
      expect(() => platformRow(valid({ markerPaths: [marker] }))).toThrow(/marker path/);
    }
  });

  test("a verification date must be a day that exists", () => {
    for (const verified of ["2026-13-45", "2026-02-30", "2026-00-10", "2026-10-00"]) {
      expect(() => platformRow(valid({ verified }))).toThrow(/yyyy-mm-dd/);
    }
    expect(platformRow(valid({ verified: "2028-02-29" })).verified).toBe("2028-02-29");
  });

  test("every text column must be filled", () => {
    expect(() => platformRow(valid({ name: " " }))).toThrow(/name/);
    expect(() => platformRow(valid({ installPath: "" }))).toThrow(/install path/);
    expect(() => platformRow(valid({ agentFinds: "" }))).toThrow(/agent-finds/);
    expect(() => platformRow(valid({ evidenceLane: "Not A Lane" }))).toThrow(/lane/);
  });

  test("a pointer path stays inside the project", () => {
    for (const path of ["/etc/replit.md", "../replit.md", " ", "a/../../b"]) {
      expect(() => platformRow(valid({ pointer: { kind: "managed-section", path } }))).toThrow(
        /project-relative/,
      );
    }
  });

  test("a rule pointer carries text, and a none pointer points at no file", () => {
    expect(() =>
      platformRow(valid({ pointer: { kind: "rule", path: ".c/r.mdc", text: " " } })),
    ).toThrow(/text/);
    expect(() => platformRow(valid({ pointer: { kind: "none", path: "x" } }))).toThrow(/no file/);
  });

  test("an id with anything after a valid kebab-case start is refused", () => {
    for (const id of ["some_platform", "ok bad", "trailing-", "x-Y"]) {
      expect(() => platformRow(valid({ id }))).toThrow(/kebab-case/);
    }
  });

  test("a date with anything around it is refused", () => {
    for (const verified of ["x2026-10-10", "2026-10-10x", " 2026-10-10"]) {
      expect(() => platformRow(valid({ verified }))).toThrow(/yyyy-mm-dd/);
    }
  });

  test("a managed-section pointer needs no text, and says what is wrong with its path", () => {
    const ok = platformRow(valid({ pointer: { kind: "managed-section", path: "replit.md" } }));
    expect(ok.pointer.path).toBe("replit.md");
    expect(() =>
      platformRow(valid({ pointer: { kind: "managed-section", path: "../x" } })),
    ).toThrow(/a pointer path is project-relative/);
  });

  test("the lane of a platform no trial exercises is the word manual", () => {
    expect(MANUAL_LANE).toBe("manual");
  });
});
