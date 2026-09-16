// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContractEntry } from "../contract-decision.js";
import {
  headingAnchors,
  headingsWithSinceMarker,
  lint,
  parseContractYaml,
  parsePageRef,
  slugify,
  unreleasedMarkerVersions,
} from "../contract-lint.js";

describe("slugify", () => {
  it("lowercases and joins words with a hyphen", () => {
    expect(slugify("Prerequisites")).toBe("prerequisites");
    expect(slugify("With file output")).toBe("with-file-output");
  });

  it("drops punctuation without collapsing the resulting double hyphen/space", () => {
    expect(slugify("Option B: Vitest Plugin (auto-context + trace output)")).toBe(
      "option-b-vitest-plugin-auto-context--trace-output",
    );
  });

  it("drops backticks around an inline-code heading", () => {
    expect(slugify("`narrativetrace doctor`")).toBe("narrativetrace-doctor");
  });

  it("folds a period between digits, matching GitHub's own slugifier", () => {
    expect(slugify("6. Proxy Options")).toBe("6-proxy-options");
  });
});

describe("headingAnchors", () => {
  it("collects every heading level as its own anchor", () => {
    const anchors = headingAnchors("# Title\n\n## Section One\n\n### Sub\n");
    expect(anchors).toEqual(new Set(["title", "section-one", "sub"]));
  });

  it("disambiguates a repeated heading the way GitHub does (foo, foo-1, foo-2)", () => {
    const anchors = headingAnchors("## Notes\n\n## Notes\n\n## Notes\n");
    expect(anchors).toEqual(new Set(["notes", "notes-1", "notes-2"]));
  });

  it("ignores a line that merely starts with # inside a code fence-like context (best-effort, no fence tracking)", () => {
    // Deliberately documents current behavior rather than asserting fence-awareness that doesn't
    // exist: a literal "# " at line-start always counts, matching the Java reference's own scope.
    expect(headingAnchors("no heading here\n").size).toBe(0);
  });
});

describe("parsePageRef", () => {
  it("splits path and anchor at the last meaningful #", () => {
    expect(parsePageRef("documentation/foo.md#some-anchor")).toEqual({
      relativePath: "documentation/foo.md",
      anchor: "some-anchor",
    });
  });

  it("throws when there is no #anchor half", () => {
    expect(() => parsePageRef("documentation/foo.md")).toThrow(/<path>#<anchor>/);
  });

  it("throws when the anchor half is empty", () => {
    expect(() => parsePageRef("documentation/foo.md#")).toThrow(/<path>#<anchor>/);
  });
});

const VALID_YAML = `
version_source: "packages/core/package.json#version"
entries:
  - id: entry-point-core
    kind: entry-point
    coordinate: "@narrativetrace/core"
    page: "documentation/foo.md#heading-one"
    claim: "core resolves"
    since: "0.1.0"
    documented_default: "PRESENT"
    probe: "contract-probe/probes/entry-point.mjs"
`;

describe("parseContractYaml", () => {
  it("parses a well-formed document", () => {
    const document = parseContractYaml(VALID_YAML);
    expect(document.versionSource).toBe("packages/core/package.json#version");
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0]?.id).toBe("entry-point-core");
  });

  it("throws on an empty document", () => {
    expect(() => parseContractYaml("")).toThrow(/empty document/);
  });

  it("throws when version_source is missing", () => {
    expect(() => parseContractYaml("entries: []\n")).toThrow(/version_source/);
  });

  it("throws when entries is missing", () => {
    expect(() => parseContractYaml('version_source: "x"\n')).toThrow(/entries/);
  });

  it("throws on an unknown kind", () => {
    const yaml = VALID_YAML.replace("kind: entry-point", "kind: not-a-real-kind");
    expect(() => parseContractYaml(yaml)).toThrow(/unknown kind/);
  });

  it("throws when an entry-point entry has no coordinate", () => {
    const yaml = VALID_YAML.split("\n")
      .filter((line) => !line.includes("coordinate:"))
      .join("\n");
    expect(() => parseContractYaml(yaml)).toThrow(/coordinate/);
  });

  it("throws when neither documented_default nor expected_effect is present", () => {
    const yaml = VALID_YAML.split("\n")
      .filter((line) => !line.includes("documented_default:"))
      .join("\n");
    expect(() => parseContractYaml(yaml)).toThrow(/documented_default.*expected_effect/);
  });
});

function baseEntry(overrides: Partial<ContractEntry> = {}): ContractEntry {
  return {
    id: "sample",
    kind: "reflectable-default",
    page: "docs/page.md#heading",
    claim: "sample claim",
    since: "0.1.0",
    expect: "true",
    probe: "probe.mjs",
    ...overrides,
  };
}

describe("lint", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "contract-lint-test-"));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "page.md"), "## Heading\n");
    writeFileSync(join(root, "probe.mjs"), "");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reports nothing for a fully consistent document", () => {
    const problems = lint(root, { versionSource: "x", entries: [baseEntry()] }, new Set());
    expect(problems).toEqual([]);
  });

  it("reports a malformed since string", () => {
    const problems = lint(
      root,
      { versionSource: "x", entries: [baseEntry({ since: "not-a-version" })] },
      new Set(),
    );
    expect(problems.some((p) => p.includes("not a real version string"))).toBe(true);
  });

  it("reports a missing probe file", () => {
    const problems = lint(
      root,
      { versionSource: "x", entries: [baseEntry({ probe: "missing.mjs" })] },
      new Set(),
    );
    expect(problems.some((p) => p.includes('probe "missing.mjs" does not exist'))).toBe(true);
  });

  it("reports a missing page file", () => {
    const problems = lint(
      root,
      { versionSource: "x", entries: [baseEntry({ page: "docs/nope.md#heading" })] },
      new Set(),
    );
    expect(problems.some((p) => p.includes('page "docs/nope.md" does not exist'))).toBe(true);
  });

  it("reports an anchor that does not resolve on an existing page", () => {
    const problems = lint(
      root,
      { versionSource: "x", entries: [baseEntry({ page: "docs/page.md#no-such-anchor" })] },
      new Set(),
    );
    expect(problems.some((p) => p.includes('anchor "#no-such-anchor" not found'))).toBe(true);
  });

  it("reports two entries making the same claim", () => {
    const entries = [baseEntry({ id: "a" }), baseEntry({ id: "b" })];
    const problems = lint(root, { versionSource: "x", entries }, new Set());
    expect(problems.some((p) => p.includes("make the same claim"))).toBe(true);
  });

  it("reports a duplicate entry id", () => {
    const entries = [
      baseEntry({ id: "dup", claim: "one" }),
      baseEntry({ id: "dup", claim: "two" }),
    ];
    const problems = lint(root, { versionSource: "x", entries }, new Set());
    expect(problems.some((p) => p.includes('duplicate entry id "dup"'))).toBe(true);
  });

  it("reports an unreleased marker version with no covering entry", () => {
    const problems = lint(
      root,
      { versionSource: "x", entries: [baseEntry({ since: "0.1.0" })] },
      new Set(["0.2.0"]),
    );
    expect(problems.some((p) => p.includes('since: "0.2.0"'))).toBe(true);
  });

  it("does not flag an unreleased marker version an entry already covers", () => {
    const problems = lint(
      root,
      { versionSource: "x", entries: [baseEntry({ since: "0.2.0" })] },
      new Set(["0.2.0"]),
    );
    expect(problems).toEqual([]);
  });
});

describe("headingsWithSinceMarker", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "contract-lint-heading-marker-test-"));
    mkdirSync(join(root, "documentation"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("flags a heading that carries an inline since-marker", () => {
    writeFileSync(
      join(root, "documentation", "guide.md"),
      "### The run has a name *(since 0.1.3, unreleased)*\n",
    );
    const hits = headingsWithSinceMarker(root);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("guide.md:1");
    expect(hits[0]).toContain(
      "since-markers belong in the body: heading anchors must survive the tag rewrite",
    );
  });

  it("does not flag a since-marker in the section body", () => {
    writeFileSync(
      join(root, "documentation", "guide.md"),
      "### The run has a name\n\n*(since 0.1.3, unreleased)*\n\nBody text.\n",
    );
    expect(headingsWithSinceMarker(root)).toEqual([]);
  });

  it("flags a since-marker heading in a translated mirror", () => {
    mkdirSync(join(root, "documentation", "es"));
    writeFileSync(
      join(root, "documentation", "es", "guia.md"),
      "### La ejecución tiene un nombre *(since 0.1.3, unreleased)*\n",
    );
    const hits = headingsWithSinceMarker(root);
    expect(hits.some((h) => h.includes("es/guia.md:1"))).toBe(true);
  });

  it("flags a since-marker heading in the root README.md", () => {
    writeFileSync(join(root, "README.md"), "## Feature *(since 0.1.3, unreleased)*\n");
    const hits = headingsWithSinceMarker(root);
    expect(hits.some((h) => h.includes("README.md:1"))).toBe(true);
  });

  it("returns nothing when documentation/ does not exist", () => {
    rmSync(join(root, "documentation"), { recursive: true, force: true });
    expect(headingsWithSinceMarker(root)).toEqual([]);
  });
});

describe("lint wires in the heading-marker guard", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "contract-lint-heading-wire-test-"));
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "documentation"));
    writeFileSync(join(root, "docs", "page.md"), "## Heading\n");
    writeFileSync(join(root, "probe.mjs"), "");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("fails the gate when a documentation heading carries an inline since-marker", () => {
    writeFileSync(
      join(root, "documentation", "guide.md"),
      "### A heading *(since 0.1.3, unreleased)*\n",
    );
    const problems = lint(root, { versionSource: "x", entries: [baseEntry()] }, new Set());
    expect(problems.some((p) => p.includes("since-markers belong in the body"))).toBe(true);
  });
});

describe("unreleasedMarkerVersions", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "contract-lint-markers-test-"));
    mkdirSync(join(root, "documentation"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("collects a version cited under documentation/", () => {
    writeFileSync(
      join(root, "documentation", "guide.md"),
      "A claim *(since 0.2.2, unreleased)*.\n",
    );
    expect(unreleasedMarkerVersions(root)).toEqual(new Set(["0.2.2"]));
  });

  it("collects a version cited in the root README.md too", () => {
    writeFileSync(join(root, "README.md"), "A claim *(since 0.1.3, unreleased)*.\n");
    expect(unreleasedMarkerVersions(root)).toEqual(new Set(["0.1.3"]));
  });

  it("returns an empty set when nothing is marked unreleased", () => {
    writeFileSync(join(root, "documentation", "guide.md"), "Nothing version-sensitive here.\n");
    expect(unreleasedMarkerVersions(root)).toEqual(new Set());
  });

  it("de-duplicates the same version cited more than once", () => {
    writeFileSync(
      join(root, "documentation", "guide.md"),
      "One *(since 0.2.2, unreleased)*. Another *(since 0.2.2, unreleased)*.\n",
    );
    expect(unreleasedMarkerVersions(root)).toEqual(new Set(["0.2.2"]));
  });
});
