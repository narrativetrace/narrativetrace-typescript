// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { appendFileSync } from "node:fs";

/**
 * The sporadic-lanes quota guard (skill-evals-multi-platform-2026-09-13.md, owner-ruled
 * 2026-09-13, rule 5): "A weekly allowance per platform, in a ledger the runner reads ... The
 * runner refuses a platform whose allowance is spent and says so; there is no override flag — the
 * owner edits the ledger." Reads/writes `ledger/quota.md` (plan tier + weekly allowance table,
 * plus a spend log the runner appends to).
 */
export interface QuotaAllowance {
  readonly platform: string;
  readonly planTier: string;
  readonly weeklyAllowance: number;
}

export interface QuotaSpendRow {
  readonly date: string;
  readonly platform: string;
  readonly skill: string;
  readonly caseName: string;
  readonly week: string;
}

export interface QuotaLedger {
  readonly allowances: readonly QuotaAllowance[];
  readonly spend: readonly QuotaSpendRow[];
}

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

/** ISO 8601 week, e.g. `2026-W37` — Monday-start, week 1 contains the year's first Thursday. */
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function pipeRows(section: string): readonly string[][] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)))
    .slice(1); // drop the header row
}

function sectionBody(content: string, heading: string): string {
  const start = content.indexOf(heading);
  if (start === -1) return "";
  const rest = content.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}

export function parseQuotaMarkdown(content: string): QuotaLedger {
  const allowances = pipeRows(sectionBody(content, "## Allowance")).map(
    ([platform, planTier, weeklyAllowance]) => ({
      platform: platform ?? "",
      planTier: planTier ?? "",
      weeklyAllowance: Number(weeklyAllowance ?? "0"),
    }),
  );
  const spend = pipeRows(sectionBody(content, "## Spend log")).map(
    ([date, platform, skill, caseName, week]) => ({
      date: date ?? "",
      platform: platform ?? "",
      skill: skill ?? "",
      caseName: caseName ?? "",
      week: week ?? "",
    }),
  );
  return { allowances, spend };
}

export function spendCountThisWeek(ledger: QuotaLedger, platform: string, week: string): number {
  return ledger.spend.filter((row) => row.platform === platform && row.week === week).length;
}

/** No override flag by design (rule 5) — a spent allowance is fixed by editing `ledger/quota.md`. */
export function checkQuota(
  ledger: QuotaLedger,
  platform: string,
  now: Date = new Date(),
): QuotaDecision {
  const allowance = ledger.allowances.find((row) => row.platform === platform);
  if (!allowance) {
    return { allowed: false, reason: `ledger/quota.md carries no allowance row for "${platform}"` };
  }
  const week = isoWeek(now);
  const spent = spendCountThisWeek(ledger, platform, week);
  if (spent >= allowance.weeklyAllowance) {
    return {
      allowed: false,
      reason:
        `${platform}'s weekly allowance (${allowance.weeklyAllowance}) is spent for ${week} ` +
        `(${spent} run(s) already) — no override; the owner edits ledger/quota.md`,
    };
  }
  return { allowed: true };
}

/** Appends one spend row to `quotaPath`'s "## Spend log" pipe table. */
export function appendSpendRow(quotaPath: string, row: QuotaSpendRow): void {
  const line = `| ${row.date} | ${row.platform} | ${row.skill} | ${row.caseName} | ${row.week} |\n`;
  appendFileSync(quotaPath, line);
}
