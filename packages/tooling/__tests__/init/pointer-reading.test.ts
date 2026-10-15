// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { renderAgentsMdBlock } from "../../src/init/agents-md-block.js";
import { renderCursorRule } from "../../src/init/cursor-rule.js";
import { readPointers } from "../../src/init/pointer-reading.js";
import { projectState } from "../../src/init/project-state.js";
import { CURSOR_RULE_TEXT } from "../../src/platforms/platform-table.js";
import { fakeCarrier } from "./fixtures.js";

const CARRIER = fakeCarrier(["a"]);
const RULE = ".cursor/rules/narrativetrace.mdc";

function state(ids: string[], files: Record<string, string> = {}, links: string[] = []) {
  return projectState({
    detectedPlatforms: new Set(ids),
    pointerFiles: new Map(Object.entries(files)),
    pointersBehindLinks: new Set(links),
  });
}

describe("the installer's reading of a platform pointer", () => {
  test("a project on no platform has nothing to read", () => {
    expect(readPointers(projectState())).toEqual([]);
  });

  test("a detected platform with no pointer in its row has nothing to read", () => {
    expect(readPointers(state(["antigravity", "claude-code"]))).toEqual([]);
  });

  test("a platform the project is not on is not read, though its pointer file exists", () => {
    expect(readPointers(state([], { [RULE]: "x" }))).toEqual([]);
  });

  test("a missing pointer is absent", () => {
    expect(readPointers(state(["cursor"]))).toEqual([
      {
        platformId: "cursor",
        platformName: "Cursor",
        path: RULE,
        status: "absent",
        coordinate: "",
      },
    ]);
  });

  test("a pointer path through a link is linked, with no coordinate", () => {
    expect(readPointers(state(["cursor"], {}, [RULE]))[0]).toEqual({
      platformId: "cursor",
      platformName: "Cursor",
      path: RULE,
      status: "linked",
      coordinate: "",
    });
  });

  test("a file with no section of ours is foreign, with no coordinate", () => {
    expect(readPointers(state(["cursor"], { [RULE]: "mine\n" }))[0]?.coordinate).toBe("");
  });

  test("refuses to read without a project state", () => {
    expect(() => readPointers(undefined as never)).toThrow(/needs a project state/);
  });

  test("a file with no section of ours is foreign", () => {
    expect(readPointers(state(["cursor"], { [RULE]: "mine\n" }))[0]?.status).toBe("foreign");
  });

  test("a file with two sections is foreign, because no single stamp can be named", () => {
    const rule = renderCursorRule(CURSOR_RULE_TEXT, CARRIER.coordinate);
    expect(readPointers(state(["cursor"], { [RULE]: rule + rule }))[0]?.status).toBe("foreign");
  });

  test("a stamped section reports its coordinate", () => {
    const rule = renderCursorRule(CURSOR_RULE_TEXT, CARRIER.coordinate);
    const [reading] = readPointers(state(["cursor"], { [RULE]: rule }));
    expect(reading?.status).toBe("section");
    expect(reading?.coordinate).toBe(CARRIER.coordinate);
  });

  test("an unstamped section reports an empty coordinate", () => {
    const rule = renderCursorRule(CURSOR_RULE_TEXT, "");
    expect(readPointers(state(["cursor"], { [RULE]: rule }))[0]?.coordinate).toBe("");
  });

  test("two platforms are read in table order", () => {
    const section = renderAgentsMdBlock(CARRIER, projectState());
    const both = state(["replit", "cursor"], { "replit.md": section });
    expect(readPointers(both).map((reading) => reading.platformId)).toEqual(["cursor", "replit"]);
  });
});

describe("a pointer the installer cannot read", () => {
  test("reads as foreign — it exists, and it is not ours", () => {
    const blocked = projectState({
      detectedPlatforms: new Set(["cursor"]),
      pointersUnwritable: new Map([[RULE, { at: RULE, why: `${RULE} is not valid UTF-8` }]]),
    });
    expect(readPointers(blocked)[0]).toMatchObject({ status: "foreign", coordinate: "" });
  });
});
