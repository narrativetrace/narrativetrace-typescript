// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, it } from "vitest";
import { type LedgerRow, parseRunsJsonl, renderPromotionMarkdown } from "../promotion-render.js";

const SKILLS = [
  { canonicalName: "narrativetrace-doctor" },
  { canonicalName: "add-narrative-tracing" },
];

function row(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    date: "2026-09-08T10:00:00.000Z",
    skill: "narrativetrace-doctor",
    case: "happy-path",
    platform: "claude",
    model: "haiku",
    trial: 1,
    result: "pass",
    ...overrides,
  };
}

describe("parseRunsJsonl", () => {
  it("parses one JSON object per non-blank line", () => {
    const content = `${JSON.stringify(row({}))}\n\n${JSON.stringify(row({ trial: 2 }))}\n`;
    expect(parseRunsJsonl(content)).toEqual([row({}), row({ trial: 2 })]);
  });

  it("returns an empty array for empty content", () => {
    expect(parseRunsJsonl("")).toEqual([]);
  });
});

describe("renderPromotionMarkdown", () => {
  it("marks a skill × platform pair with no rows as 'not yet run'", () => {
    const md = renderPromotionMarkdown(SKILLS, []);
    expect(md).toContain("| `narrativetrace-doctor` | not yet run | not yet run | not yet run |");
    expect(md).toContain("| `add-narrative-tracing` | not yet run | not yet run | not yet run |");
  });

  it("marks the most recent passing trial as green with its model and date", () => {
    const runs = [row({ platform: "claude", model: "haiku", date: "2026-09-08T10:00:00.000Z" })];
    const md = renderPromotionMarkdown(SKILLS, runs);
    expect(md).toContain(
      "| `narrativetrace-doctor` | green (haiku, 2026-09-08) | not yet run | not yet run |",
    );
  });

  it("marks the most recent failing trial as red", () => {
    const runs = [row({ platform: "codex", model: "mini", result: "fail" })];
    const md = renderPromotionMarkdown(SKILLS, runs);
    expect(md).toContain(
      "| `narrativetrace-doctor` | not yet run | red (mini, 2026-09-08) | not yet run |",
    );
  });

  it("uses the LATEST row when a pair has more than one, even if an earlier one failed", () => {
    const runs = [
      row({ platform: "codex", result: "fail", date: "2026-09-08T10:00:00.000Z" }),
      row({ platform: "codex", result: "pass", model: "mini", date: "2026-09-09T10:00:00.000Z" }),
    ];
    const md = renderPromotionMarkdown(SKILLS, runs);
    expect(md).toContain(
      "| `narrativetrace-doctor` | not yet run | green (mini, 2026-09-09) | not yet run |",
    );
  });

  it("marks a pair 'approved' once a green trigger sample AND a green happy-path both landed", () => {
    const runs = [
      row({ platform: "gemini", case: "happy-path", result: "pass" }),
      row({ platform: "gemini", case: "trigger-sample", result: "pass" }),
    ];
    const md = renderPromotionMarkdown(SKILLS, runs);
    expect(md).toContain("| `narrativetrace-doctor` | not yet run | not yet run | approved |");
  });

  it("does NOT approve on a green happy-path alone, with no trigger sample", () => {
    const runs = [row({ platform: "gemini", case: "happy-path", result: "pass" })];
    const md = renderPromotionMarkdown(SKILLS, runs);
    expect(md).toContain(
      "| `narrativetrace-doctor` | not yet run | not yet run | green (haiku, 2026-09-08) |",
    );
  });

  it("keeps skill×platform pairs independent — one pair's rows never color another's cell", () => {
    const runs = [row({ skill: "narrativetrace-doctor", platform: "claude", result: "pass" })];
    const md = renderPromotionMarkdown(SKILLS, runs);
    expect(md).toContain("| `add-narrative-tracing` | not yet run | not yet run | not yet run |");
  });
});
