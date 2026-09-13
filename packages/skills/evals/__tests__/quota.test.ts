// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendSpendRow,
  checkQuota,
  isoWeek,
  parseQuotaMarkdown,
  spendCountThisWeek,
} from "../quota.js";

const SAMPLE = `# Sporadic eval quota

Some prose.

## Allowance

| platform | plan tier | weekly allowance |
|---|---|---|
| codex | basic | 4 |
| gemini | not installed | 0 |

## Spend log

Some prose.

| date | platform | skill | case | week |
|---|---|---|---|---|
| 2026-09-08T10:00:00.000Z | codex | narrativetrace-doctor | happy-path | 2026-W37 |
| 2026-09-08T11:00:00.000Z | codex | narrativetrace-doctor | deviation-redaction-gap | 2026-W37 |
`;

describe("isoWeek", () => {
  it("matches the well-known 2026-09-08 -> 2026-W37 mapping", () => {
    expect(isoWeek(new Date("2026-09-08T00:00:00.000Z"))).toBe("2026-W37");
  });

  it("rolls a Sunday into the same week as the Monday before it", () => {
    const monday = isoWeek(new Date("2026-09-07T00:00:00.000Z"));
    const sunday = isoWeek(new Date("2026-09-13T00:00:00.000Z"));
    expect(sunday).toBe(monday);
  });

  it("assigns a Friday January 1st to the OLD year's last week (2026-W53), per ISO 8601", () => {
    expect(isoWeek(new Date("2027-01-01T00:00:00.000Z"))).toBe("2026-W53");
  });
});

describe("parseQuotaMarkdown", () => {
  it("parses the allowance table", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    expect(ledger.allowances).toEqual([
      { platform: "codex", planTier: "basic", weeklyAllowance: 4 },
      { platform: "gemini", planTier: "not installed", weeklyAllowance: 0 },
    ]);
  });

  it("parses the spend log", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    expect(ledger.spend).toEqual([
      {
        date: "2026-09-08T10:00:00.000Z",
        platform: "codex",
        skill: "narrativetrace-doctor",
        caseName: "happy-path",
        week: "2026-W37",
      },
      {
        date: "2026-09-08T11:00:00.000Z",
        platform: "codex",
        skill: "narrativetrace-doctor",
        caseName: "deviation-redaction-gap",
        week: "2026-W37",
      },
    ]);
  });

  it("returns empty allowances/spend for content with no matching sections", () => {
    expect(parseQuotaMarkdown("# Empty\n")).toEqual({ allowances: [], spend: [] });
  });
});

describe("spendCountThisWeek", () => {
  it("counts only rows matching both platform and week", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    expect(spendCountThisWeek(ledger, "codex", "2026-W37")).toBe(2);
    expect(spendCountThisWeek(ledger, "codex", "2026-W38")).toBe(0);
    expect(spendCountThisWeek(ledger, "gemini", "2026-W37")).toBe(0);
  });
});

describe("checkQuota", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");

  it("allows a platform under its weekly allowance", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    expect(checkQuota(ledger, "codex", now)).toEqual({ allowed: true });
  });

  it("refuses a platform whose allowance is spent, with a reason naming the ledger", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    const nearlySpent = {
      ...ledger,
      allowances: [{ platform: "codex", planTier: "basic", weeklyAllowance: 2 }],
    };
    const decision = checkQuota(nearlySpent, "codex", now);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/no override/);
    expect(decision.reason).toMatch(/ledger\/quota\.md/);
  });

  it("refuses a platform whose allowance is 0 (e.g. gemini before install)", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    const decision = checkQuota(ledger, "gemini", now);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/no override/);
  });

  it("refuses a platform absent from the ledger entirely, naming the missing row", () => {
    const ledger = parseQuotaMarkdown(SAMPLE);
    const decision = checkQuota(ledger, "claude", now);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/no allowance row/);
  });
});

describe("appendSpendRow", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "quota-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends a pipe-table row that re-parses back to the same data", () => {
    const path = join(dir, "quota.md");
    writeFileSync(path, SAMPLE);
    appendSpendRow(path, {
      date: "2026-09-09T09:00:00.000Z",
      platform: "codex",
      skill: "add-narrative-tracing",
      caseName: "happy-path",
      week: "2026-W37",
    });
    const reparsed = parseQuotaMarkdown(readFileSync(path, "utf-8"));
    expect(reparsed.spend).toHaveLength(3);
    expect(reparsed.spend[2]).toEqual({
      date: "2026-09-09T09:00:00.000Z",
      platform: "codex",
      skill: "add-narrative-tracing",
      caseName: "happy-path",
      week: "2026-W37",
    });
  });
});
