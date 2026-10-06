// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import {
  appendToText,
  endsInsideFence,
  eolOf,
  hasExactlyOneRegion,
  lineIs,
  lineIsIgnoringTrailingSpace,
  removeLine,
  removeRegion,
  replaceRegion,
  scanMarkedBlocks,
  withEol,
} from "../../src/init/marked-block.js";

/**
 * The managed block is found by its markers, and everything the installer does to a consumer file
 * is expressed as an edit of that region. These cases pin the marker rule itself — column 0,
 * outside fenced code — and the reversibility every `init` / `uninstall` round trip depends on.
 *
 * Named after `MarkedBlockTest` in the Java reference so the two lists diff.
 */

const BLOCK =
  "<!-- narrativetrace:start @narrativetrace/skills@1.2.3 -->\n" +
  "## NarrativeTrace\n" +
  "<!-- narrativetrace:end -->\n";

function firstRegion(text: string) {
  const [region] = scanMarkedBlocks(text).regions;
  if (!region) throw new Error("the fixture was expected to carry one region");
  return region;
}

describe("finding the region", () => {
  test("finds one region and reads its coordinate", () => {
    const text = `# Title\n\n${BLOCK}`;

    const scan = scanMarkedBlocks(text);

    expect(scan.problems).toEqual([]);
    expect(scan.regions).toHaveLength(1);
    expect(firstRegion(text).coordinate).toBe("@narrativetrace/skills@1.2.3");
    expect(text.slice(firstRegion(text).start, firstRegion(text).end)).toBe(BLOCK);
  });

  test("finds a region whose opening marker carries no coordinate", () => {
    const scan = scanMarkedBlocks(
      "<!-- narrativetrace:start -->\nbody\n<!-- narrativetrace:end -->\n",
    );

    expect(scan.regions).toHaveLength(1);
    expect(scan.regions[0]?.coordinate).toBe("");
  });

  test("reads no coordinate from an opening marker that never closes", () => {
    const scan = scanMarkedBlocks(
      "<!-- narrativetrace:start oops\nbody\n<!-- narrativetrace:end -->\n",
    );

    expect(scan.regions).toHaveLength(1);
    expect(scan.regions[0]?.coordinate).toBe("");
  });

  test("finds two regions so the caller can refuse them", () => {
    const scan = scanMarkedBlocks(`${BLOCK}\ntext\n\n${BLOCK}`);

    expect(scan.regions).toHaveLength(2);
    expect(scan.problems).toEqual([]);
  });

  test("reports a start with no end naming the line", () => {
    const scan = scanMarkedBlocks("a\n<!-- narrativetrace:start -->\nb\n");

    expect(scan.regions).toEqual([]);
    expect(scan.problems).toHaveLength(1);
    expect(scan.problems[0]).toContain("line 2");
    expect(scan.problems[0]).toContain("no end");
  });

  test("reports an end with no start naming the line", () => {
    const scan = scanMarkedBlocks("a\n<!-- narrativetrace:end -->\n");

    expect(scan.problems).toHaveLength(1);
    expect(scan.problems[0]).toContain("line 2");
    expect(scan.problems[0]).toContain("no start");
  });

  test.each([
    [`# Title\n\n${BLOCK}`, true],
    [`${BLOCK}${BLOCK}`, false],
    ["# Title\n", false],
    ["<!-- narrativetrace:end -->\n", false],
  ] as const)("hasExactlyOneRegion(%j) is %s", (text, expected) => {
    expect(hasExactlyOneRegion(scanMarkedBlocks(text))).toBe(expected);
  });

  test("reports a second start before the first end", () => {
    const scan = scanMarkedBlocks(
      "<!-- narrativetrace:start -->\n<!-- narrativetrace:start -->\n" +
        "<!-- narrativetrace:end -->\n",
    );

    expect(scan.problems).toHaveLength(1);
    expect(scan.problems[0]).toContain("line 2");
  });
});

describe("near misses: what is not a marker", () => {
  test("ignores a marker inside a fenced code block", () => {
    const scan = scanMarkedBlocks(`# Docs\n\n\`\`\`\n${BLOCK}\`\`\`\n`);

    expect(scan.regions).toEqual([]);
    expect(scan.problems).toEqual([]);
  });

  test("ignores a marker inside a tilde-fenced code block", () => {
    expect(scanMarkedBlocks(`~~~\n${BLOCK}~~~\n`).regions).toEqual([]);
  });

  test("sees a marker again after the fence closes", () => {
    const text = `\`\`\`\n<!-- narrativetrace:start -->\n\`\`\`\n${BLOCK}`;

    expect(scanMarkedBlocks(text).regions).toHaveLength(1);
  });

  test("ignores an indented marker", () => {
    const text = "  <!-- narrativetrace:start -->\n  <!-- narrativetrace:end -->\n";

    expect(scanMarkedBlocks(text).regions).toEqual([]);
    expect(scanMarkedBlocks(text).problems).toEqual([]);
  });

  // A fence is recognised at column 0 by its PREFIX: a line that merely ends with the delimiter is
  // prose, and treating it as a fence would hide every marker after it.
  test("does not read a line that only ends with a fence delimiter as one", () => {
    const text = `a line ending in ~~~\n${BLOCK}a line ending in \`\`\`\n`;

    expect(scanMarkedBlocks(text).regions).toHaveLength(1);
  });

  test("ignores this repository's own skills markers", () => {
    const text = "<!-- narrativetrace:skills:start -->\nx\n<!-- narrativetrace:skills:end -->\n";

    expect(scanMarkedBlocks(text).regions).toEqual([]);
    expect(scanMarkedBlocks(text).problems).toEqual([]);
  });

  test("finds a marker on the first line behind a byte-order mark", () => {
    expect(scanMarkedBlocks(`﻿${BLOCK}`).regions).toHaveLength(1);
  });

  test("finds a region whose end marker is the last line without a trailing newline", () => {
    const text = "<!-- narrativetrace:start -->\nbody\n<!-- narrativetrace:end -->";

    const scan = scanMarkedBlocks(text);

    expect(scan.regions).toHaveLength(1);
    expect(text.slice(firstRegion(text).start, firstRegion(text).end)).toBe(text);
  });
});

describe("editing", () => {
  test("replaces only the region and leaves the rest byte for byte", () => {
    const text = `# Title\n\n${BLOCK}\ntail\n`;

    expect(replaceRegion(text, firstRegion(text), "<!-- new -->\n")).toBe(
      "# Title\n\n<!-- new -->\n\ntail\n",
    );
  });

  test("replace preserves Windows line endings", () => {
    const text = `# Title\r\n\r\n${BLOCK.replaceAll("\n", "\r\n")}`;

    expect(replaceRegion(text, firstRegion(text), withEol("x\n", "\r\n"))).toBe(
      "# Title\r\n\r\nx\r\n",
    );
  });

  test("appends after exactly one blank line", () => {
    expect(appendToText("# Title\n", BLOCK)).toBe(`# Title\n\n${BLOCK}`);
  });

  test("appends to a file without a trailing newline by adding one", () => {
    expect(appendToText("# Title", BLOCK)).toBe(`# Title\n\n${BLOCK}`);
  });

  test("appends to an empty file without a leading blank line", () => {
    expect(appendToText("", BLOCK)).toBe(BLOCK);
  });

  test("appends with the file's own line ending", () => {
    const crlf = BLOCK.replaceAll("\n", "\r\n");

    expect(appendToText("# Title\r\n", crlf)).toBe(`# Title\r\n\r\n${crlf}`);
  });

  test.each([
    "# Title\n",
    "a\n\n\n",
    "x\r\n",
    "# T\r\n\r\n",
    "",
  ])("removing what was appended restores %j byte for byte", (original) => {
    const appended = appendToText(original, withEol(BLOCK, eolOf(original)));

    expect(removeRegion(appended, firstRegion(appended))).toBe(original);
  });

  test("removing a block at the start of the file leaves the rest", () => {
    const text = `${BLOCK}tail\n`;

    expect(removeRegion(text, firstRegion(text))).toBe("tail\n");
  });

  test("removing a line takes the blank line an append would have put before it", () => {
    const text = appendToText("# Title\n", "@AGENTS.md\n");
    const line = lineIs(text, "@AGENTS.md");
    if (!line) throw new Error("the appended line was expected to be found");

    expect(removeLine(text, line)).toBe("# Title\n");
  });

  test("finds a line only outside a fence, and only as the whole line", () => {
    const text = "```\n@AGENTS.md\n```\n> @AGENTS.md\n@AGENTS.md  \n";

    expect(lineIs(text, "@AGENTS.md")).toBeUndefined();
    expect(lineIsIgnoringTrailingSpace(text, "@AGENTS.md")?.number).toBe(5);
  });
});

describe("unfinished fences", () => {
  test.each([
    ["# Title\n\n```\ncode\n", true],
    ["~~~\ncode\n", true],
    ["```\ncode\n```\n", false],
    ["```\na\n```\ntext\n```\nb\n", true],
    ["# Title\n", false],
    ["", false],
    ["  ```\nindented, not a fence\n", false],
  ] as const)("endsInsideFence(%j) is %s", (text, expected) => {
    expect(endsInsideFence(text)).toBe(expected);
  });
});

describe("line endings", () => {
  test.each([
    ["a\r\nb\n", "\r\n"],
    ["a\nb\r\n", "\n"],
    ["no terminator", "\n"],
    ["", "\n"],
    ["\nx", "\n"],
    ["\r\nx", "\r\n"],
  ] as const)("reads the line ending of %j as %j", (text, expected) => {
    expect(eolOf(text)).toBe(expected);
  });

  test("treats a lone carriage return as a finished line", () => {
    expect(appendToText("x\r", BLOCK)).toBe(`x\r\n${BLOCK}`);
  });

  test("rewrites a block's line endings", () => {
    expect(withEol("a\nb\n", "\r\n")).toBe("a\r\nb\r\n");
    expect(withEol("a\r\nb\r\n", "\n")).toBe("a\nb\n");
  });
});
