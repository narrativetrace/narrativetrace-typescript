// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentArgv } from "./agent-command.js";
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

/**
 * Tier B trial runner core (skill-harness-design.md §4.3, §5.1; `run.ts` is the CLI shim over
 * {@link runCli}). The first real trial (2026-09-13) found the runner had never been under a
 * test: (1) a case's `case.json`-declared fixture path was joined onto the repo root when it was
 * written package-root-relative (`evals/fixtures/empty-project`, matching this package's own
 * README tree) — `add-narrative-tracing`'s happy-path case could not scaffold; (2) the agent
 * command was a shell string with the prompt spliced in (see `agent-command.ts`). Every side
 * effect — process spawning, the clock, ledger/quota file IO, fixture scaffolding, the Tier A/A2
 * precondition, promotion-matrix regeneration — is threaded through {@link RunnerDeps} so the
 * whole scaffold -> drive agent -> grade -> append-ledger-row flow runs under a unit test with a
 * fake agent and a temp ledger, never a real CLI (the `replaySkill`/`assertDeterministicTiersGreen`
 * injectable-function idiom this package already uses elsewhere).
 */

export interface RunArgs {
  readonly skill: string;
  readonly caseName: string;
  readonly platform: Platform;
  readonly model: string;
  readonly agentCommand?: string;
  readonly trials: number;
}

export type SpawnFn = (command: string, args: readonly string[], cwd: string) => void;

/** A resolved-path or config defect in the runner itself — never the agent's or grader's fault. */
export class HarnessError extends Error {}

export interface RunnerDeps {
  readonly evalsDir: string;
  readonly packageRoot: string;
  readonly repoRoot: string;
  readonly ledgerPath: string;
  readonly quotaPath: string;
  readonly now: () => Date;
  readonly exists: (path: string) => boolean;
  readonly readFile: (path: string) => string;
  readonly spawnAgent: SpawnFn;
  readonly spawnGrader: SpawnFn;
  readonly scaffoldFixture: (absoluteFixtureDir: string) => string;
  readonly cleanupScratch: (scratchDir: string) => void;
  readonly appendLedgerRow: (ledgerPath: string, row: Record<string, unknown>) => void;
  readonly appendQuotaSpend: (quotaPath: string, row: QuotaSpendRow) => void;
  readonly assertTiersGreen: (repoRoot: string) => void;
  readonly regeneratePromotion: () => void;
}

export function parseArgs(argv: readonly string[]): RunArgs {
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

interface FixtureSpec {
  readonly relativePath: string;
  readonly root: "repo" | "package";
}

const DEFAULT_FIXTURE: FixtureSpec = { relativePath: "examples/sixty-seconds", root: "repo" };

/**
 * A case may declare its own fixture in `case.json` — written package-root-relative
 * (`evals/fixtures/...`, the path a reader sees in this package's own README tree); with no
 * manifest, the canonical fixture is the repo-root-relative `examples/sixty-seconds`. Neither is
 * ever guessed from `process.cwd()` — both roots come from {@link RunnerDeps}, themselves derived
 * once from the runner module's own location (`productionDeps`).
 */
export function caseFixtureSpec(
  evalsDir: string,
  skill: string,
  caseName: string,
  deps: Pick<RunnerDeps, "exists" | "readFile">,
): FixtureSpec {
  const manifestPath = join(evalsDir, skill, caseName, "case.json");
  if (!deps.exists(manifestPath)) return DEFAULT_FIXTURE;
  const { fixture } = JSON.parse(deps.readFile(manifestPath)) as { fixture: string };
  return { relativePath: fixture, root: "package" };
}

export function resolveFixturePath(
  repoRoot: string,
  packageRoot: string,
  spec: FixtureSpec,
): string {
  return join(spec.root === "package" ? packageRoot : repoRoot, spec.relativePath);
}

/** The case's own directory (prompt.md + graders/), always module/package-rooted — never cwd. */
export function resolveCaseDir(evalsDir: string, skill: string, caseName: string): string {
  return join(evalsDir, skill, caseName);
}

/** A fresh temp copy outside every repo tree (the study isolation rule) — never the fixture in place. */
export function scaffoldFixture(absoluteFixtureDir: string): string {
  const scratch = mkdtempSync(join(tmpdir(), "nt-eval-"));
  cpSync(absoluteFixtureDir, scratch, { recursive: true });
  return scratch;
}

export function cleanupScratch(scratchDir: string): void {
  rmSync(scratchDir, { recursive: true, force: true });
}

export function spawnInherit(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

/**
 * Runs the case's grader with an argv, never a shell. `caseDir` is already module/package-rooted;
 * a missing script is a harness bug ({@link HarnessError}, never silently graded "fail"), a
 * nonzero exit or spawn failure from a script that DOES exist is an ordinary grading "fail".
 */
export function runGrader(
  caseDir: string,
  cwd: string,
  spawn: SpawnFn,
  exists: (path: string) => boolean = existsSync,
): "pass" | "fail" {
  const scriptPath = join(caseDir, "graders", "verify.sh");
  if (!exists(scriptPath)) {
    throw new HarnessError(`grader script not found at ${scriptPath}`);
  }
  try {
    spawn("sh", [scriptPath], cwd);
    return "pass";
  } catch {
    return "fail";
  }
}

/**
 * Builds the agent CLI's argv from the platform preset (or an explicit `--agent-command`
 * override) and spawns it with the prompt as ONE argv element — see `agent-command.ts` for why
 * this, and never a shell string, is what keeps a backtick/`$(...)`/quote/newline in the prompt
 * from being parsed as shell syntax.
 */
export function runAgentStep(args: RunArgs, prompt: string, cwd: string, spawn: SpawnFn): void {
  const template = args.agentCommand ?? presetAgentCommand(args.platform, args.model, args.skill);
  if (!template) {
    console.log("(no --agent-command given — skipping the agent step, grading the fixture as-is)");
    return;
  }
  const [command, ...rest] = buildAgentArgv(template, prompt);
  if (!command) throw new HarnessError(`--agent-command produced an empty argv: "${template}"`);
  spawn(command, rest, cwd);
}

interface TrialOutcome {
  readonly result: "pass" | "fail";
  readonly note?: string;
}

/** Tags a caught throw so the ledger row can tell a harness bug from an agent crash (both "fail"). */
function runTrialBody(
  args: RunArgs,
  caseDir: string,
  prompt: string,
  cwd: string,
  deps: RunnerDeps,
): TrialOutcome {
  try {
    runAgentStep(args, prompt, cwd, deps.spawnAgent);
    return { result: runGrader(caseDir, cwd, deps.spawnGrader, deps.exists) };
  } catch (error) {
    const message = (error as Error).message;
    const note =
      error instanceof HarnessError ? `harness: ${message}` : `agent crashed: ${message}`;
    return { result: "fail", note };
  }
}

function ledgerRow(
  args: RunArgs,
  trial: number,
  now: Date,
  outcome: TrialOutcome,
): Record<string, unknown> {
  return {
    date: now.toISOString(),
    skill: args.skill,
    case: args.caseName,
    platform: args.platform,
    model: args.model,
    trial,
    result: outcome.result,
    ...(outcome.note ? { note: outcome.note } : {}),
  };
}

function runOneTrial(
  args: RunArgs,
  caseDir: string,
  prompt: string,
  trial: number,
  deps: RunnerDeps,
): TrialOutcome {
  const spec = caseFixtureSpec(deps.evalsDir, args.skill, args.caseName, deps);
  const scratch = deps.scaffoldFixture(resolveFixturePath(deps.repoRoot, deps.packageRoot, spec));
  try {
    const outcome = runTrialBody(args, caseDir, prompt, scratch, deps);
    deps.appendLedgerRow(deps.ledgerPath, ledgerRow(args, trial, deps.now(), outcome));
    deps.regeneratePromotion();
    console.log(`trial ${trial}/${args.trials}: ${outcome.result}`);
    return outcome;
  } finally {
    deps.cleanupScratch(scratch);
  }
}

function loadQuotaLedger(deps: RunnerDeps): QuotaLedger {
  return parseQuotaMarkdown(deps.readFile(deps.quotaPath));
}

/** Refuses (no override) unless `platform` still has weekly allowance left, this run's own spend included. */
function assertQuotaAvailable(
  platform: Platform,
  sessionSpend: readonly QuotaSpendRow[],
  deps: RunnerDeps,
): void {
  const ledger = loadQuotaLedger(deps);
  const spend = [...ledger.spend, ...sessionSpend];
  const decision = checkQuota({ ...ledger, spend }, platform, deps.now());
  if (!decision.allowed) throw new Error(decision.reason);
}

function recordSporadicSpend(args: RunArgs, deps: RunnerDeps): QuotaSpendRow {
  const now = deps.now();
  const row: QuotaSpendRow = {
    date: now.toISOString(),
    platform: args.platform,
    skill: args.skill,
    caseName: args.caseName,
    week: isoWeek(now),
  };
  deps.appendQuotaSpend(deps.quotaPath, row);
  return row;
}

/**
 * Runs `args.trials` trials of one skill/case/platform/model combination. Codex/Gemini (the
 * sporadic lanes) refuse to start unless Tier A/A2 are green at HEAD and, per trial, unless the
 * platform's weekly quota still has room this run's own spend included; Claude is exempt from
 * both checks and never appends a quota-spend row.
 */
export function runTrials(args: RunArgs, deps: RunnerDeps): void {
  if (isSporadicPlatform(args.platform)) deps.assertTiersGreen(deps.repoRoot);

  const caseDir = resolveCaseDir(deps.evalsDir, args.skill, args.caseName);
  const promptPath = join(caseDir, "prompt.md");
  if (!deps.exists(promptPath)) throw new Error(`No case found at ${caseDir}`);
  const prompt = deps.readFile(promptPath);

  const sessionSpend: QuotaSpendRow[] = [];
  for (let trial = 1; trial <= args.trials; trial++) {
    if (isSporadicPlatform(args.platform)) assertQuotaAvailable(args.platform, sessionSpend, deps);
    runOneTrial(args, caseDir, prompt, trial, deps);
    if (isSporadicPlatform(args.platform)) sessionSpend.push(recordSporadicSpend(args, deps));
  }
}

/**
 * `ledger/promotion.md` is build output of `ledger/runs.jsonl` (`tools/promotion-render.ts`),
 * checked in-gate by `pnpm run promotion-check`. A bare `run.ts` invocation used to leave that
 * regeneration to the owner's memory, so a trial run outside `pnpm run check` silently left the
 * matrix stale until someone thought to run `pnpm run promotion-render` by hand — the design
 * ruling this closes: the runner regenerates it itself, every trial, and the drift check stays as
 * the gate's own belt-and-suspenders. Reuses the same {@link SpawnFn} seam as the agent/grader
 * steps so a test can fake it without a real `pnpm` subprocess.
 */
export function regeneratePromotionInPlace(repoRoot: string, spawn: SpawnFn = spawnInherit): void {
  spawn("pnpm", ["run", "promotion-render"], repoRoot);
}

/** Wires every seam to its production implementation, rooted at `evalsDir` (never `process.cwd()`). */
export function productionDeps(evalsDir: string): RunnerDeps {
  const packageRoot = join(evalsDir, "..");
  const repoRoot = join(evalsDir, "..", "..", "..");
  return {
    evalsDir,
    packageRoot,
    repoRoot,
    ledgerPath: join(packageRoot, "ledger", "runs.jsonl"),
    quotaPath: join(packageRoot, "ledger", "quota.md"),
    now: () => new Date(),
    exists: existsSync,
    readFile: (path) => readFileSync(path, "utf-8"),
    spawnAgent: spawnInherit,
    spawnGrader: spawnInherit,
    scaffoldFixture,
    cleanupScratch,
    appendLedgerRow: (path, row) => appendFileSync(path, `${JSON.stringify(row)}\n`),
    appendQuotaSpend: appendSpendRow,
    assertTiersGreen: assertDeterministicTiersGreen,
    regeneratePromotion: () => regeneratePromotionInPlace(repoRoot),
  };
}

/** The CLI entry point (`run.ts`) — `evalsDir` is that file's own `import.meta.dirname`. */
export function runCli(argv: readonly string[], evalsDir: string): void {
  runTrials(parseArgs(argv), productionDeps(evalsDir));
}
