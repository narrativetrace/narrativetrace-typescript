// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { projectState } from "../../src/init/project-state.js";
import { readProjectState } from "../../src/init/project-state-reader.js";

/**
 * What the snapshot knows about the platform table: which rows' markers the project carries, what
 * each pointer file says now, and which pointer paths run through a link.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "nt-platform-state-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(relative: string, content: string): void {
  const file = join(dir, relative);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content, "utf8");
}

describe("detecting platforms", () => {
  test("an untouched project is on no platform and has no pointer", () => {
    const state = readProjectState(dir);
    expect([...state.detectedPlatforms]).toEqual([]);
    expect(state.pointerFiles.size).toBe(0);
    expect(state.pointersBehindLinks.size).toBe(0);
  });

  test("a .cursor directory proves Cursor", () => {
    mkdirSync(join(dir, ".cursor"));
    expect([...readProjectState(dir).detectedPlatforms]).toEqual(["cursor"]);
  });

  test("a near-miss directory proves nothing", () => {
    mkdirSync(join(dir, ".cursorx"));
    mkdirSync(join(dir, ".cursor-old"));
    expect([...readProjectState(dir).detectedPlatforms]).toEqual([]);
  });

  test("either replit.md or .replit proves Replit", () => {
    write("replit.md", "# notes\n");
    expect([...readProjectState(dir).detectedPlatforms]).toEqual(["replit"]);
    rmSync(join(dir, "replit.md"));
    write(".replit", "run = 'x'\n");
    expect([...readProjectState(dir).detectedPlatforms]).toEqual(["replit"]);
  });

  test("two platforms at once are both detected, in table order", () => {
    write(".replit", "x\n");
    mkdirSync(join(dir, ".agents/rules"), { recursive: true });
    mkdirSync(join(dir, ".cursor"));
    expect([...readProjectState(dir).detectedPlatforms]).toEqual([
      "cursor",
      "replit",
      "antigravity",
    ]);
  });

  test("the skills init itself writes are no Antigravity marker", () => {
    mkdirSync(join(dir, ".agents/skills"), { recursive: true });
    expect([...readProjectState(dir).detectedPlatforms]).toEqual([]);
  });

  test("a nested marker path is matched whole", () => {
    write(".github/copilot-instructions.md", "x\n");
    expect([...readProjectState(dir).detectedPlatforms]).toEqual(["github-copilot"]);
  });
});

describe("reading pointer files", () => {
  test("reads an existing pointer file byte for byte, byte-order mark and CRLF included", () => {
    write("replit.md", "﻿# Notes\r\n");
    expect(readProjectState(dir).pointerFiles.get("replit.md")).toBe("﻿# Notes\r\n");
  });

  test("reads the Cursor rule when it exists", () => {
    write(".cursor/rules/narrativetrace.mdc", "rule\n");
    expect(readProjectState(dir).pointerFiles.get(".cursor/rules/narrativetrace.mdc")).toBe(
      "rule\n",
    );
  });

  test("reads a pointer path behind a linked file as behind a link, with no text", () => {
    write("elsewhere.md", "theirs\n");
    symlinkSync(join(dir, "elsewhere.md"), join(dir, "replit.md"));
    const state = readProjectState(dir);
    expect(state.pointersBehindLinks.has("replit.md")).toBe(true);
    expect(state.pointerFiles.has("replit.md")).toBe(false);
  });

  test("reads a pointer path behind a linked directory as behind a link", () => {
    mkdirSync(join(dir, "outside", "rules"), { recursive: true });
    mkdirSync(join(dir, ".cursor"));
    symlinkSync(join(dir, "outside", "rules"), join(dir, ".cursor", "rules"));
    const state = readProjectState(dir);
    expect(state.pointersBehindLinks.has(".cursor/rules/narrativetrace.mdc")).toBe(true);
  });
});

describe("the snapshot's platform guards", () => {
  test("a hand-built snapshot defaults to no platform", () => {
    expect(projectState().detectedPlatforms.size).toBe(0);
  });

  test("refuses a platform id the table does not know", () => {
    expect(() => projectState({ detectedPlatforms: new Set(["cursorx"]) })).toThrow(/cursorx/);
    expect(() => projectState({ detectedPlatforms: new Set(["a", "b"]) })).toThrow(/got a, b$/);
  });
});

describe("reading a pointer path that cannot hold a file", () => {
  test("a directory where the file belongs is unwritable, naming the file", () => {
    mkdirSync(join(dir, "replit.md"));
    const state = readProjectState(dir);
    expect(state.pointersUnwritable.get("replit.md")).toEqual({
      at: "replit.md",
      why: "replit.md is not a file",
    });
  });

  test("a file where a directory belongs is unwritable, naming the file above", () => {
    write(".cursor", "not a directory\n");
    expect(
      readProjectState(dir).pointersUnwritable.get(".cursor/rules/narrativetrace.mdc"),
    ).toEqual({
      at: ".cursor",
      why: ".cursor is not a directory",
    });
  });

  test("bytes that are not UTF-8 are unwritable, never decoded with replacement characters", () => {
    writeFileSync(join(dir, "replit.md"), Buffer.from([0xff, 0xfe, 0x41]));
    const state = readProjectState(dir);
    expect(state.pointersUnwritable.get("replit.md")?.why).toBe("replit.md is not valid UTF-8");
    expect(state.pointerFiles.has("replit.md")).toBe(false);
  });

  test("an ordinary file is none of those", () => {
    write("replit.md", "# fine\n");
    expect(readProjectState(dir).pointersUnwritable.size).toBe(0);
  });

  test("names the deepest element that blocks, as a /-joined path from the project root", () => {
    mkdirSync(join(dir, ".cursor"));
    write(".cursor/rules", "a file where the rules directory belongs\n");
    expect(
      readProjectState(dir).pointersUnwritable.get(".cursor/rules/narrativetrace.mdc"),
    ).toEqual({
      at: ".cursor/rules",
      why: ".cursor/rules is not a directory",
    });
  });
});
