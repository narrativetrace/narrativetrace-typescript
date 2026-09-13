// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyVersionBanner,
  countUnreleasedMarkers,
  currentVersionBanner,
  extractRepoVersion,
  extractUnreleasedCount,
  freshVersionCache,
  isCacheFresh,
  readVersionCache,
  refreshUnreleasedClauseInBanner,
  renderVersionBannerLine,
  resolvePublishedVersion,
  stripCacheAgeComment,
  withCacheAgeComment,
  writeVersionCache,
} from "../llms-version-banner.js";

describe("renderVersionBannerLine", () => {
  it("versions equal", () => {
    expect(renderVersionBannerLine("0.2.2", "0.2.2")).toBe("*(Docs and published both at 0.2.2.)*");
  });

  it("versions differ", () => {
    expect(renderVersionBannerLine("0.2.2", "0.2.1")).toBe(
      "*(These docs describe 0.2.2; published is 0.2.1.)*",
    );
  });

  it("offline — no answer at all", () => {
    expect(renderVersionBannerLine("0.2.2", undefined)).toBe(
      "*(These docs describe 0.2.2; published: unknown offline.)*",
    );
  });

  it("versions equal, with a count of 0 behaviours marked unreleased — no clause at all", () => {
    expect(renderVersionBannerLine("0.2.2", "0.2.2", 0)).toBe(
      "*(Docs and published both at 0.2.2.)*",
    );
  });

  it("versions equal, with exactly 1 behaviour marked unreleased — singular noun", () => {
    expect(renderVersionBannerLine("0.2.2", "0.2.2", 1)).toBe(
      "*(Docs and published both at 0.2.2; 1 behaviour marked unreleased.)*",
    );
  });

  it("versions equal, with several behaviours marked unreleased — plural noun", () => {
    expect(renderVersionBannerLine("0.1.3", "0.1.3", 4)).toBe(
      "*(Docs and published both at 0.1.3; 4 behaviours marked unreleased.)*",
    );
  });

  it("versions differ, with behaviours marked unreleased", () => {
    expect(renderVersionBannerLine("0.1.3", "0.1.1", 4)).toBe(
      "*(These docs describe 0.1.3; published is 0.1.1; 4 behaviours marked unreleased.)*",
    );
  });

  it("offline, with behaviours marked unreleased", () => {
    expect(renderVersionBannerLine("0.1.3", undefined, 4)).toBe(
      "*(These docs describe 0.1.3; published: unknown offline; 4 behaviours marked unreleased.)*",
    );
  });
});

describe("extractUnreleasedCount", () => {
  it("reads 0 out of a line with no clause", () => {
    expect(extractUnreleasedCount("*(Docs and published both at 0.2.2.)*")).toBe(0);
  });

  it("reads a singular clause", () => {
    expect(
      extractUnreleasedCount(
        "*(Docs and published both at 0.2.2; 1 behaviour marked unreleased.)*",
      ),
    ).toBe(1);
  });

  it("reads a plural clause from any of the three forms", () => {
    expect(
      extractUnreleasedCount(
        "*(These docs describe 0.1.3; published is 0.1.1; 4 behaviours marked unreleased.)*",
      ),
    ).toBe(4);
    expect(
      extractUnreleasedCount(
        "*(These docs describe 0.1.3; published: unknown offline; 4 behaviours marked unreleased.)*",
      ),
    ).toBe(4);
  });
});

describe("refreshUnreleasedClauseInBanner", () => {
  it("inserts a clause into a line that had none", () => {
    expect(refreshUnreleasedClauseInBanner("*(Docs and published both at 0.2.2.)*", 4)).toBe(
      "*(Docs and published both at 0.2.2; 4 behaviours marked unreleased.)*",
    );
  });

  it("drops a stale clause when the new count is 0", () => {
    const before = "*(Docs and published both at 0.2.2; 4 behaviours marked unreleased.)*";
    expect(refreshUnreleasedClauseInBanner(before, 0)).toBe(
      "*(Docs and published both at 0.2.2.)*",
    );
  });

  it("replaces a stale count with a fresh one, singular to plural", () => {
    const before = "*(Docs and published both at 0.2.2; 1 behaviour marked unreleased.)*";
    expect(refreshUnreleasedClauseInBanner(before, 4)).toBe(
      "*(Docs and published both at 0.2.2; 4 behaviours marked unreleased.)*",
    );
  });

  it("leaves a trailing cache-age comment untouched", () => {
    const before = withCacheAgeComment(
      "*(Docs and published both at 0.2.2; 4 behaviours marked unreleased.)*",
      0,
    );
    expect(refreshUnreleasedClauseInBanner(before, 0)).toBe(
      withCacheAgeComment("*(Docs and published both at 0.2.2.)*", 0),
    );
  });
});

describe("withCacheAgeComment / stripCacheAgeComment", () => {
  it("appends a trailing HTML comment carrying the timestamp", () => {
    const line = withCacheAgeComment("*(Docs and published both at 0.2.2.)*", 0);
    expect(line).toBe(
      "*(Docs and published both at 0.2.2.)*<!-- registry checked 1970-01-01T00:00:00.000Z -->",
    );
  });

  it("omits the comment when there is no answer to time-stamp", () => {
    expect(withCacheAgeComment("*(offline line)*", undefined)).toBe("*(offline line)*");
  });

  it("round-trips: stripping what was just appended returns the original line", () => {
    const original = "*(These docs describe 0.2.2; published is 0.2.1.)*";
    expect(stripCacheAgeComment(withCacheAgeComment(original, 123))).toBe(original);
  });

  it("is a no-op on a line with no comment", () => {
    expect(stripCacheAgeComment("*(no comment here)*")).toBe("*(no comment here)*");
  });
});

describe("extractRepoVersion", () => {
  it("reads the repo version out of the equal-versions form", () => {
    expect(extractRepoVersion("*(Docs and published both at 0.2.2.)*")).toBe("0.2.2");
  });

  it("reads the repo version out of the differ form", () => {
    expect(extractRepoVersion("*(These docs describe 0.2.2; published is 0.2.1.)*")).toBe("0.2.2");
  });

  it("reads the repo version out of the offline form", () => {
    expect(extractRepoVersion("*(These docs describe 0.2.2; published: unknown offline.)*")).toBe(
      "0.2.2",
    );
  });

  it("ignores a trailing cache-age comment", () => {
    const line = withCacheAgeComment("*(Docs and published both at 0.2.2.)*", 0);
    expect(extractRepoVersion(line)).toBe("0.2.2");
  });

  it("returns undefined for a non-banner line", () => {
    expect(extractRepoVersion("not a banner at all")).toBeUndefined();
  });
});

describe("applyVersionBanner / currentVersionBanner", () => {
  const page = "# NarrativeTrace\n\n> tagline here\n";

  it("inserts a banner under the H1 when there is none yet", () => {
    const after = applyVersionBanner(page, "*(banner)*");
    expect(after.split("\n").slice(0, 3)).toEqual(["# NarrativeTrace", "*(banner)*", ""]);
    expect(currentVersionBanner(after)).toBe("*(banner)*");
  });

  it("replaces a pre-existing banner in place, leaving the rest untouched", () => {
    const withBanner = applyVersionBanner(page, "*(old banner)*");
    const updated = applyVersionBanner(withBanner, "*(new banner)*");
    expect(currentVersionBanner(updated)).toBe("*(new banner)*");
    expect(updated.split("\n").slice(2)).toEqual(withBanner.split("\n").slice(2));
  });

  it("throws when the page has no top-level heading", () => {
    expect(() => applyVersionBanner("no heading here\n", "*(banner)*")).toThrow(/no top-level/);
  });

  it("reports no current banner on a page that has never had one", () => {
    expect(currentVersionBanner(page)).toBeUndefined();
  });
});

describe("cache freshness and resolvePublishedVersion", () => {
  let dir: string;
  let cachePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "llms-version-cache-test-"));
    cachePath = join(dir, "cache.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("a cache written just now is fresh", () => {
    writeVersionCache({ publishedVersion: "0.2.1", fetchedAtMs: 1000 }, cachePath);
    const entry = readVersionCache(cachePath);
    expect(entry && isCacheFresh(entry, 1000 + 60_000)).toBe(true);
  });

  it("a cache older than the max age is stale", () => {
    writeVersionCache({ publishedVersion: "0.2.1", fetchedAtMs: 0 }, cachePath);
    const entry = readVersionCache(cachePath);
    expect(entry && isCacheFresh(entry, 60 * 60 * 1000 + 1)).toBe(false);
    expect(freshVersionCache(cachePath, 60 * 60 * 1000 + 1)).toBeUndefined();
  });

  it("resolvePublishedVersion trusts a fresh cache with no network call at all", async () => {
    writeVersionCache({ publishedVersion: "0.2.1", fetchedAtMs: 1000 }, cachePath);
    const fetchLatestStatus = async () => {
      throw new Error("should not have been called");
    };
    const result = await resolvePublishedVersion({
      packageName: "@narrativetrace/core",
      nowMs: 1000 + 1000,
      cachePath,
      fetchLatestStatus: fetchLatestStatus as never,
    });
    expect(result).toEqual({ publishedVersion: "0.2.1", asOfMs: 1000 });
  });

  it("resolvePublishedVersion fetches and caches on a stale/missing cache", async () => {
    const result = await resolvePublishedVersion({
      packageName: "@narrativetrace/core",
      nowMs: 5000,
      cachePath,
      fetchLatestStatus: async () => ({ status: 200, body: JSON.stringify({ version: "0.2.2" }) }),
    });
    expect(result).toEqual({ publishedVersion: "0.2.2", asOfMs: 5000 });
    expect(readVersionCache(cachePath)).toEqual({ publishedVersion: "0.2.2", fetchedAtMs: 5000 });
  });

  it("resolvePublishedVersion returns no answer, and never writes the cache, when offline", async () => {
    const result = await resolvePublishedVersion({
      packageName: "@narrativetrace/core",
      nowMs: 5000,
      cachePath,
      fetchLatestStatus: async () => ({ status: 0, body: "" }),
    });
    expect(result).toEqual({ publishedVersion: undefined, asOfMs: undefined });
    expect(readVersionCache(cachePath)).toBeUndefined();
  });

  it("resolvePublishedVersion treats an unparseable body as no answer", async () => {
    const result = await resolvePublishedVersion({
      packageName: "@narrativetrace/core",
      nowMs: 5000,
      cachePath,
      fetchLatestStatus: async () => ({ status: 200, body: "not json" }),
    });
    expect(result.publishedVersion).toBeUndefined();
  });
});

describe("countUnreleasedMarkers", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "llms-unreleased-count-test-"));
    mkdirSync(join(dir, "documentation"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("counts 0 across docs with no marker at all", () => {
    writeFileSync(join(dir, "documentation", "guide.md"), "# Guide\n\nNothing unreleased here.\n");
    expect(countUnreleasedMarkers(dir)).toBe(0);
  });

  it("counts a single marker", () => {
    writeFileSync(
      join(dir, "documentation", "guide.md"),
      "# Guide\n\nSome behaviour. *(since 0.1.3, unreleased)*\n",
    );
    expect(countUnreleasedMarkers(dir)).toBe(1);
  });

  it("counts several markers across multiple English doc files, plus llms.txt and README.md", () => {
    writeFileSync(
      join(dir, "documentation", "guide.md"),
      "*(since 0.1.3, unreleased)* and *(since 0.1.3, unreleased)*\n",
    );
    writeFileSync(
      join(dir, "documentation", "llms.txt"),
      "# NarrativeTrace\n\n*(since 0.1.3, unreleased)*\n",
    );
    writeFileSync(join(dir, "README.md"), "*(since 0.1.3, unreleased)*\n");
    expect(countUnreleasedMarkers(dir)).toBe(4);
  });

  it("never counts a translated mirror under documentation/es|pt-BR|zh-CN", () => {
    mkdirSync(join(dir, "documentation", "es"), { recursive: true });
    writeFileSync(join(dir, "documentation", "guide.md"), "*(since 0.1.3, unreleased)*\n");
    writeFileSync(join(dir, "documentation", "es", "guia.md"), "*(since 0.1.3, unreleased)*\n");
    expect(countUnreleasedMarkers(dir)).toBe(1);
  });

  // The real 2026-09-12 gap: a marker split by a Markdown hard-wrap is invisible to a line-based
  // grep/sed, since neither half of the pattern is then a complete line on its own — see
  // UNRELEASED_MARKER_RE's own doc comment. Both wrap points must still count.
  it("counts a marker wrapped right after 'since'", () => {
    writeFileSync(join(dir, "documentation", "guide.md"), "*(since\n0.1.3, unreleased)*\n");
    expect(countUnreleasedMarkers(dir)).toBe(1);
  });

  it("counts a marker wrapped right after the version's comma", () => {
    writeFileSync(join(dir, "documentation", "guide.md"), "*(since 0.1.3,\nunreleased)*\n");
    expect(countUnreleasedMarkers(dir)).toBe(1);
  });
});
