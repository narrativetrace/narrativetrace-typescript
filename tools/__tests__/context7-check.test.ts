// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type Context7Config,
  declaredTags,
  isIndexed,
  loadConfig,
  schemaViolations,
  untaggedFenceLines,
  untaggedFences,
  versionDrift,
  versionTags,
} from "../context7-check.js";

const FENCE = "```";
const { config, schema } = loadConfig(process.cwd());

describe("context7.json against the committed Context7 schema", () => {
  it("the repository's own file validates", () => {
    expect(schemaViolations(config, schema)).toEqual([]);
  });

  it("rejects an unknown property", () => {
    expect(schemaViolations({ ...config, slogan: "x" }, schema)).not.toEqual([]);
  });

  it("rejects a description over 500 characters", () => {
    expect(schemaViolations({ ...config, description: "x".repeat(501) }, schema)).not.toEqual([]);
  });

  it("rejects a url without its public_key", () => {
    expect(schemaViolations({ ...config, url: "https://context7.com/a/b" }, schema)).not.toEqual(
      [],
    );
  });

  it("carries no ownership fields (the owner adds them at submission)", () => {
    expect(config).not.toHaveProperty("url");
    expect(config).not.toHaveProperty("public_key");
  });
});

describe("previousVersions derived from the v* tags", () => {
  it("equals this repository's tags, newest first", () => {
    const tags = versionTags(process.cwd());
    if (tags.length > 0) expect(versionDrift(config, tags)).toEqual([]);
  });

  it("names a tag the file forgot", () => {
    expect(versionDrift({ previousVersions: [{ tag: "v1.0.0" }] }, ["v1.1.0", "v1.0.0"])).toEqual([
      "tag v1.1.0 missing from previousVersions",
    ]);
  });

  it("names a declared version that is no tag", () => {
    const drift = versionDrift({ previousVersions: ["v1.0.0", "v0.9"] }, ["v1.0.0"]);
    expect(drift).toEqual(["previousVersions names v0.9, which is no v* tag"]);
  });

  it("flags the right set in the wrong order", () => {
    const declared: Context7Config = { previousVersions: [{ tag: "v1.0.0" }, { tag: "v1.1.0" }] };
    expect(versionDrift(declared, ["v1.1.0", "v1.0.0"])).toHaveLength(1);
  });

  it("reads a branch entry as a non-tag", () => {
    expect(declaredTags({ previousVersions: [{ branch: "release-1.x" }] })).toEqual([
      "branch:release-1.x",
    ]);
  });
});

describe("which files Context7 indexes", () => {
  const cfg: Context7Config = {
    folders: ["documentation"],
    excludeFolders: ["documentation/es"],
    excludeFiles: ["SECURITY.md"],
  };

  it("indexes a root-level file and a file under a listed folder", () => {
    expect([isIndexed("README.md", cfg), isIndexed("documentation/faq.md", cfg)]).toEqual([
      true,
      true,
    ]);
  });

  it("skips a file outside every listed folder", () => {
    expect(isIndexed("packages/cli/README.md", cfg)).toBe(false);
  });

  it("skips an excluded folder and everything under it, but not a sibling sharing the prefix", () => {
    expect(isIndexed("documentation/es/faq.md", cfg)).toBe(false);
    expect(isIndexed("documentation/esx/faq.md", cfg)).toBe(true);
  });

  it("skips an excluded file name at the root and nested", () => {
    expect([isIndexed("SECURITY.md", cfg), isIndexed("documentation/SECURITY.md", cfg)]).toEqual([
      false,
      false,
    ]);
  });

  it("indexes everything when no folders are listed", () => {
    expect(isIndexed("packages/cli/README.md", {})).toBe(true);
  });
});

describe("untagged code fences", () => {
  it("reports an opening fence with no language, by 1-based line", () => {
    expect(untaggedFenceLines(`text\n${FENCE}\nx\n${FENCE}\n${FENCE}ts\ny\n${FENCE}`)).toEqual([2]);
  });

  it("reports tilde fences and indented fences", () => {
    expect(untaggedFenceLines("~~~\nx\n~~~\n  ```\n  y\n  ```")).toEqual([1, 4]);
  });

  it("does not take a closing fence for an opening one", () => {
    expect(untaggedFenceLines(`${FENCE}ts\nx\n${FENCE}\n`)).toEqual([]);
  });

  it("keeps a shorter fence inside a longer one as content", () => {
    const text = `\`\`\`\`markdown\n${FENCE}\nx\n${FENCE}\n\`\`\`\`\n`;
    expect(untaggedFenceLines(text)).toEqual([]);
  });

  it("does not take inline triple backticks for a fence", () => {
    expect(untaggedFenceLines("use ```x``` inline\n```` ``` ````")).toEqual([]);
  });

  it("tolerates CRLF line endings", () => {
    expect(untaggedFenceLines(`${FENCE}\r\nx\r\n${FENCE}\r\n`)).toEqual([1]);
  });
});

describe("the fence audit over a tree", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "context7-"));
    mkdirSync(join(root, "documentation/es"), { recursive: true });
    writeFileSync(join(root, "README.md"), `${FENCE}\nx\n${FENCE}\n`);
    writeFileSync(join(root, "documentation/a.md"), `ok\n${FENCE}\nx\n${FENCE}\n`);
    writeFileSync(join(root, "documentation/es/a.md"), `${FENCE}\nx\n${FENCE}\n`);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("reports shipped, indexed files and skips the excluded mirror", () => {
    const found = untaggedFences(root, {
      folders: ["documentation"],
      excludeFolders: ["documentation/es"],
    });
    expect(found).toEqual([
      { file: "documentation/a.md", line: 2 },
      { file: "README.md", line: 1 },
    ]);
  });
});

describe("this repository's indexed documentation", () => {
  it("has no untagged code fence", () => {
    expect(untaggedFences(process.cwd(), config)).toEqual([]);
  });
});
