// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import {
  brokenLinks,
  compareCodeBlockContent,
  compareCodeBlockCounts,
  compareHeadings,
  compareTables,
  profileOf,
} from "../translation-check-structure.js";

describe("profileOf", () => {
  it("collects heading levels in document order", () => {
    const text = "# Title\n\n## Section\n\n### Sub\n";
    expect(profileOf(text).headingLevels).toEqual([1, 2, 3]);
  });

  it("ignores headings that appear inside fenced code", () => {
    const text = "# Title\n\n```md\n# Not a real heading\n```\n";
    expect(profileOf(text).headingLevels).toEqual([1]);
  });

  it("collects fenced code block contents", () => {
    const text = "```ts\nconst a = 1;\n```\n\ntext\n\n```js\nconst b = 2;\n```\n";
    expect(profileOf(text).codeBlocks).toEqual(["const a = 1;", "const b = 2;"]);
  });

  it("collects table shapes, excluding the header/separator rows from the row count", () => {
    const text = "| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n";
    expect(profileOf(text).tables).toEqual([{ rows: 2, cols: 2 }]);
  });

  it("does not treat a pipe-prefixed line with no separator row as a table", () => {
    const text = "| not a table\n";
    expect(profileOf(text).tables).toEqual([]);
  });

  it("treats two adjacent pipe blocks separated by prose as distinct tables", () => {
    const text = "| A |\n|---|\n| 1 |\n\ntext\n\n| B |\n|---|\n| 2 |\n";
    expect(profileOf(text).tables).toHaveLength(2);
  });
});

describe("compareHeadings", () => {
  it("passes on an identical heading sequence", () => {
    expect(compareHeadings([1, 2, 2], [1, 2, 2], "f.md")).toEqual([]);
  });

  it("fails when heading counts differ", () => {
    expect(compareHeadings([1, 2], [1], "f.md")).toEqual([
      "f.md: heading count differs — source has 2, translation has 1",
    ]);
  });

  it("fails when a heading level differs at the same position", () => {
    expect(compareHeadings([1, 2], [1, 3], "f.md")).toEqual([
      "f.md: heading 2 level differs — source h2, translation h3",
    ]);
  });
});

describe("compareCodeBlockCounts", () => {
  it("passes when counts match", () => {
    expect(compareCodeBlockCounts(["a"], ["b"], "f.md")).toEqual([]);
  });

  it("fails when counts differ", () => {
    expect(compareCodeBlockCounts(["a", "b"], ["a"], "f.md")).toEqual([
      "f.md: code block count differs — source has 2, translation has 1",
    ]);
  });
});

describe("compareCodeBlockContent", () => {
  it("warns, never fails semantics, when content differs at matching counts", () => {
    expect(
      compareCodeBlockContent(["const a = 1;"], ["// comentario\nconst a = 1;"], "f.md"),
    ).toEqual([
      "f.md: code block 1 content differs from source (verify localized comments/placeholders by hand)",
    ]);
  });

  it("is silent when content is identical", () => {
    expect(compareCodeBlockContent(["const a = 1;"], ["const a = 1;"], "f.md")).toEqual([]);
  });

  it("is silent (deferred to the count check) when counts differ", () => {
    expect(compareCodeBlockContent(["a", "b"], ["a"], "f.md")).toEqual([]);
  });
});

describe("compareTables", () => {
  it("passes on identical shapes", () => {
    expect(compareTables([{ rows: 2, cols: 3 }], [{ rows: 2, cols: 3 }], "f.md")).toEqual([]);
  });

  it("fails when table counts differ", () => {
    expect(compareTables([{ rows: 1, cols: 1 }], [], "f.md")).toEqual([
      "f.md: table count differs — source has 1, translation has 0",
    ]);
  });

  it("fails when a shape differs at the same table index", () => {
    expect(compareTables([{ rows: 2, cols: 2 }], [{ rows: 3, cols: 2 }], "f.md")).toEqual([
      "f.md: table 1 shape differs — source 2x2, translation 3x2",
    ]);
  });
});

describe("brokenLinks", () => {
  it("reports a relative link that does not resolve", () => {
    const failures = brokenLinks(
      "[Guide](missing-guide.md)",
      "documentation/es/guia.md",
      () => false,
    );
    expect(failures).toEqual(["documentation/es/guia.md: broken link to 'missing-guide.md'"]);
  });

  it("passes a relative link that resolves", () => {
    expect(brokenLinks("[Guide](guia-2.md)", "documentation/es/guia.md", () => true)).toEqual([]);
  });

  it("ignores external links", () => {
    const failures = brokenLinks(
      "[Site](https://example.com/x)",
      "documentation/es/guia.md",
      () => false,
    );
    expect(failures).toEqual([]);
  });

  it("strips an anchor before resolving the file target", () => {
    let seen: string | undefined;
    brokenLinks("[Section](guia.md#section)", "documentation/es/x.md", (path) => {
      seen = path;
      return true;
    });
    expect(seen).not.toContain("#");
  });

  it("ignores links inside fenced code", () => {
    const failures = brokenLinks(
      "```md\n[Guide](missing.md)\n```",
      "documentation/es/guia.md",
      () => false,
    );
    expect(failures).toEqual([]);
  });
});
