// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyMask,
  englishDocPages,
  extractRegion,
  parseSnippetBlocks,
  resolveSnippetSource,
  stripLicenseHeader,
} from "../snippet-shared.js";

describe("parseSnippetBlocks", () => {
  it("parses a path-only marker", () => {
    const text = [
      "<!-- snippet: src/a.js -->",
      "```js",
      "const a = 1;",
      "```",
      "<!-- /snippet -->",
      "",
    ].join("\n");
    const [block] = parseSnippetBlocks("page.md", text);
    expect(block).toMatchObject({
      path: "src/a.js",
      region: undefined,
      mask: undefined,
      fenceLang: "js",
      contentLines: ["const a = 1;"],
    });
  });

  it("parses region and mask attributes in either order", () => {
    const text = [
      "<!-- snippet: out.txt mask=duration -->",
      "```text",
      "hello — 3ms",
      "```",
      "<!-- /snippet -->",
      "<!-- snippet: src/a.js region=body -->",
      "```js",
      "x();",
      "```",
      "<!-- /snippet -->",
    ].join("\n");
    const blocks = parseSnippetBlocks("page.md", text);
    expect(blocks[0]).toMatchObject({ path: "out.txt", mask: "duration" });
    expect(blocks[1]).toMatchObject({ path: "src/a.js", region: "body" });
  });

  it("tolerates blank lines between the marker, the fence, and the closing marker", () => {
    const text = [
      "<!-- snippet: a.js -->",
      "",
      "```js",
      "x();",
      "```",
      "",
      "<!-- /snippet -->",
    ].join("\n");
    const [block] = parseSnippetBlocks("page.md", text);
    expect(block?.contentLines).toEqual(["x();"]);
  });

  it("finds every block in document order", () => {
    const text = [
      "<!-- snippet: a.js -->",
      "```js",
      "1;",
      "```",
      "<!-- /snippet -->",
      "prose in between",
      "<!-- snippet: b.js -->",
      "```js",
      "2;",
      "```",
      "<!-- /snippet -->",
    ].join("\n");
    const blocks = parseSnippetBlocks("page.md", text);
    expect(blocks.map((b) => b.path)).toEqual(["a.js", "b.js"]);
  });

  it("throws naming the page and line when no fence follows the marker", () => {
    const text = ["intro", "<!-- snippet: a.js -->", "not a fence"].join("\n");
    expect(() => parseSnippetBlocks("page.md", text)).toThrow(/page\.md:2/);
  });

  it("throws when the fence is never closed", () => {
    const text = ["<!-- snippet: a.js -->", "```js", "x();"].join("\n");
    expect(() => parseSnippetBlocks("page.md", text)).toThrow(/never closed/);
  });

  it("throws when there is no closing marker", () => {
    const text = ["<!-- snippet: a.js -->", "```js", "x();", "```"].join("\n");
    expect(() => parseSnippetBlocks("page.md", text)).toThrow(/no matching/);
  });
});

describe("applyMask", () => {
  it("passes text through unchanged with no mask", () => {
    expect(applyMask("x — 3ms", undefined)).toBe("x — 3ms");
  });

  it("normalizes every duration in the text", () => {
    const text = "a — 3ms and b — 12.5ms";
    expect(applyMask(text, "duration")).toBe("a — Nms and b — Nms");
  });

  it("rejects an unknown mask rather than silently comparing unmasked text", () => {
    expect(() => applyMask("x", "gibberish")).toThrow(/unsupported mask/);
  });
});

describe("stripLicenseHeader", () => {
  it("strips the header the publication step stamps, plus the blank line that follows it", () => {
    const text = [
      "// SPDX-License-Identifier: BUSL-1.1",
      "// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0",
      "// Copyright (c) 2026 Empower Agile",
      "",
      "// index.js",
      "const a = 1;",
    ].join("\n");
    expect(stripLicenseHeader(text)).toBe(["// index.js", "const a = 1;"].join("\n"));
  });

  it("strips the header with no blank line after it (the publication step's actual stamp)", () => {
    const text = [
      "// SPDX-License-Identifier: BUSL-1.1",
      "// Licensed under the Business Source License 1.1 (see LICENSE)",
      "// Copyright (c) 2026 Empower Agile",
      "// index.js",
      "const a = 1;",
    ].join("\n");
    expect(stripLicenseHeader(text)).toBe(["// index.js", "const a = 1;"].join("\n"));
  });

  it("strips a #-comment header after a shebang, preserving the shebang line", () => {
    const text = [
      "#!/usr/bin/env bash",
      "# SPDX-License-Identifier: BUSL-1.1",
      "# Licensed under the Business Source License 1.1",
      "# Copyright (c) 2026 Empower Agile",
      "",
      "echo hi",
    ].join("\n");
    expect(stripLicenseHeader(text)).toBe(["#!/usr/bin/env bash", "echo hi"].join("\n"));
  });

  it("strips a single /* … */ block header", () => {
    const text = [
      "/*",
      " * SPDX-License-Identifier: BUSL-1.1",
      " * Licensed under the Business Source License 1.1",
      " */",
      "",
      "const a = 1;",
    ].join("\n");
    expect(stripLicenseHeader(text)).toBe("const a = 1;");
  });

  it("leaves the text unchanged when no header is present", () => {
    const text = ["// index.js", "const a = 1;"].join("\n");
    expect(stripLicenseHeader(text)).toBe(text);
  });

  it("preserves a non-license leading comment, such as the tutorial's own // index.js", () => {
    const text = ["// index.js", 'import { foo } from "bar";', "foo();"].join("\n");
    expect(stripLicenseHeader(text)).toBe(text);
  });
});

describe("extractRegion", () => {
  it("returns the lines strictly between the begin/end comments", () => {
    const source = [
      "before",
      "// snippet:begin body",
      "kept();",
      "// snippet:end body",
      "after",
    ].join("\n");
    expect(extractRegion(source, "body", "a.js")).toBe("kept();");
  });

  it("throws naming the path and region when the pair is missing", () => {
    expect(() => extractRegion("no markers here", "body", "a.js")).toThrow(/a\.js.*body/);
  });
});

describe("resolveSnippetSource", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "snippet-shared-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads a whole file with exactly one trailing newline stripped", () => {
    const path = join(dir, "a.txt");
    writeFileSync(path, "line one\nline two\n", "utf-8");
    const block = {
      page: "page.md",
      markerLine: 1,
      path,
      region: undefined,
      mask: undefined,
      fenceLang: "text",
      contentLines: [],
      contentStart: 0,
      contentEnd: 0,
    };
    expect(resolveSnippetSource(block)).toBe("line one\nline two");
  });

  it("strips a stamped license header before comparing, leaving the source's own leading comment", () => {
    const path = join(dir, "index.js");
    writeFileSync(
      path,
      `${[
        "// SPDX-License-Identifier: BUSL-1.1",
        "// Licensed under the Business Source License 1.1",
        "// Copyright (c) 2026 Empower Agile",
        "// index.js",
        "const a = 1;",
      ].join("\n")}\n`,
      "utf-8",
    );
    const block = {
      page: "page.md",
      markerLine: 1,
      path,
      region: undefined,
      mask: undefined,
      fenceLang: "js",
      contentLines: [],
      contentStart: 0,
      contentEnd: 0,
    };
    expect(resolveSnippetSource(block)).toBe(["// index.js", "const a = 1;"].join("\n"));
  });

  it("throws naming the page, line, and path when the source does not exist", () => {
    const block = {
      page: "page.md",
      markerLine: 7,
      path: join(dir, "missing.txt"),
      region: undefined,
      mask: undefined,
      fenceLang: "text",
      contentLines: [],
      contentStart: 0,
      contentEnd: 0,
    };
    expect(() => resolveSnippetSource(block)).toThrow(/page\.md:7/);
  });
});

describe("englishDocPages", () => {
  const dir = mkdtempSync(join(tmpdir(), "snippet-docs-"));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("lists only top-level .md files, sorted, never a language subdirectory", () => {
    writeFileSync(join(dir, "b.md"), "", "utf-8");
    writeFileSync(join(dir, "a.md"), "", "utf-8");
    writeFileSync(join(dir, "not-markdown.txt"), "", "utf-8");
    mkdirSync(join(dir, "es"));
    writeFileSync(join(dir, "es", "c.md"), "", "utf-8");
    expect(englishDocPages(dir)).toEqual([join(dir, "a.md"), join(dir, "b.md")]);
  });

  it("also includes llms.txt — the one non-Markdown page, held to the same no-drift guarantee", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.md"), "", "utf-8");
    writeFileSync(join(dir, "llms.txt"), "", "utf-8");
    writeFileSync(join(dir, "other.txt"), "", "utf-8");
    expect(englishDocPages(dir)).toEqual([join(dir, "a.md"), join(dir, "llms.txt")]);
  });

  it("returns an empty list when the directory does not exist", () => {
    expect(englishDocPages(join(dir, "nope"))).toEqual([]);
  });
});
