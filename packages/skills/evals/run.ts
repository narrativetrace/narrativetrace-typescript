#!/usr/bin/env -S npx tsx
// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
/**
 * Tier B trial runner (skill-harness-design.md §4.3, §5.1). NEVER invoked by `pnpm run check` —
 * the owner runs this by hand or from the nightly job, against a subscription CLI, never the
 * metered API. Scaffolds the case's fixture into a scratch directory (a fresh temp copy outside
 * every repo tree), drives the requested agent CLI against the prompt with the catalogue loaded,
 * runs the case's grader, and appends one row to `ledger/runs.jsonl`.
 *
 * `--platform claude|codex|gemini` fills `--agent-command` with that platform's preset
 * (platform-presets.ts) — pass `--agent-command` explicitly to override it, e.g. a different
 * model flag shape:
 *
 *   pnpm exec tsx evals/run.ts --skill narrativetrace-doctor --case happy-path \
 *     --platform claude --model <cheapest-available>
 *
 * Codex and Gemini are the two sporadic lanes (skill-evals-multi-platform-2026-09-13.md):
 * every trial on either platform first refuses to start unless @narrativetrace/skills' Tier A
 * lints and Tier A2 replay are green at HEAD (tier-precondition.ts), and then unless
 * `ledger/quota.md` still has weekly allowance left for that platform (quota.ts) — no override
 * flag either way; fix the tests or edit the ledger. Claude is exempt from both: it runs on the
 * harness's own regular cadence, not the sporadic policy.
 */
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isPlatform,
  isSporadicPlatform,
  type Platform,
  presetAgentCommand,
} from "./platform-presets.js";
import {
  appendSpendRow,
  checkQuota,
  isoWeek,
  parseQuotaMarkdown,
  type QuotaLedger,
  type QuotaSpendRow,
} from "./quota.js";
import { assertDeterministicTiersGreen } from "./tier-precondition.js";

interface RunArgs {
  readonly skill: string;
  readonly caseName: string;
  readonly platform: Platform;
  readonly model: string;
  readonly agentCommand?: string;
  readonly trials: number;
}

const EVALS_DIR = import.meta.dirname;
const REPO_ROOT = join(EVALS_DIR, "..", "..", "..");
const LEDGER_PATH = join(EVALS_DIR, "..", "ledger", "runs.jsonl");
const QUOTA_PATH = join(EVALS_DIR, "..", "ledger", "quota.md");

function parseArgs(argv: readonly string[]): RunArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const skill = get("--skill");
  const caseName = get("--case");
  const platform = get("--platform");
  const model = get("--model");
  if (!skill || !caseName || !platform || !model || !isPlatform(platform)) {
    throw new Error(
      "Usage: run.ts --skill <name> --case <name> --platform <claude|codex|gemini> --model <id> " +
        '[--agent-command "<template with {prompt}>"] [--trials N]',
    );
  }
  return {
    skill,
    caseName,
    platform,
    model,
    agentCommand: get("--agent-command"),
    trials: Number(get("--trials") ?? "1"),
  };
}

/** A case directory may declare which fixture to scaffold; defaults to the skill's own canonical fixture. */
function caseFixture(skill: string, caseName: string): string {
  const manifestPath = join(EVALS_DIR, skill, caseName, "case.json");
  if (existsSync(manifestPath)) {
    return (JSON.parse(readFileSync(manifestPath, "utf-8")) as { fixture: string }).fixture;
  }
  return "examples/sixty-seconds";
}

/** A fresh temp copy outside every repo tree (the study isolation rule) — never the repo's own fixture in place. */
function scaffoldFixture(fixtureRelativePath: string): string {
  const scratch = mkdtempSync(join(tmpdir(), "nt-eval-"));
  cpSync(join(REPO_ROOT, fixtureRelativePath), scratch, { recursive: true });
  return scratch;
}

function runGrader(caseDir: string, cwd: string): "pass" | "fail" {
  try {
    execFileSync("sh", [join(caseDir, "graders", "verify.sh")], { cwd, stdio: "inherit" });
    return "pass";
  } catch {
    return "fail";
  }
}

function appendLedgerRow(row: Record<string, unknown>): void {
  appendFileSync(LEDGER_PATH, `${JSON.stringify(row)}\n`);
}

function loadQuotaLedger(): QuotaLedger {
  return parseQuotaMarkdown(readFileSync(QUOTA_PATH, "utf-8"));
}

/** Refuses (no override) unless `platform` still has weekly allowance left, this run's own spend included. */
function assertQuotaAvailable(platform: Platform, sessionSpend: readonly QuotaSpendRow[]): void {
  const ledger = loadQuotaLedger();
  const decision = checkQuota({ ...ledger, spend: [...ledger.spend, ...sessionSpend] }, platform);
  if (!decision.allowed) throw new Error(decision.reason);
}

function recordSporadicSpend(args: RunArgs): QuotaSpendRow {
  const row: QuotaSpendRow = {
    date: new Date().toISOString(),
    platform: args.platform,
    skill: args.skill,
    caseName: args.caseName,
    week: isoWeek(new Date()),
  };
  appendSpendRow(QUOTA_PATH, row);
  return row;
}

function runOneTrial(args: RunArgs, caseDir: string, prompt: string, trial: number): void {
  const scratch = scaffoldFixture(caseFixture(args.skill, args.caseName));
  try {
    const agentCommand =
      args.agentCommand ?? presetAgentCommand(args.platform, args.model, args.skill);
    if (agentCommand) {
      execFileSync(agentCommand.replace("{prompt}", prompt), {
        cwd: scratch,
        shell: true,
        stdio: "inherit",
      });
    } else {
      console.log(
        "(no --agent-command given — skipping the agent step, grading the fixture as-is)",
      );
    }
    const result = runGrader(caseDir, scratch);
    appendLedgerRow({
      date: new Date().toISOString(),
      skill: args.skill,
      case: args.caseName,
      platform: args.platform,
      model: args.model,
      trial,
      result,
    });
    console.log(`trial ${trial}/${args.trials}: ${result}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (isSporadicPlatform(args.platform)) assertDeterministicTiersGreen(REPO_ROOT);

  const caseDir = join(EVALS_DIR, args.skill, args.caseName);
  const promptPath = join(caseDir, "prompt.md");
  if (!existsSync(promptPath)) throw new Error(`No case found at ${caseDir}`);
  const prompt = readFileSync(promptPath, "utf-8");

  const sessionSpend: QuotaSpendRow[] = [];
  for (let trial = 1; trial <= args.trials; trial++) {
    if (isSporadicPlatform(args.platform)) assertQuotaAvailable(args.platform, sessionSpend);
    runOneTrial(args, caseDir, prompt, trial);
    if (isSporadicPlatform(args.platform)) sessionSpend.push(recordSporadicSpend(args));
  }
}

main();
