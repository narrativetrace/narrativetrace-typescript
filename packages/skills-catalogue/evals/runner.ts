// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildAgentArgv } from "./agent-command.js";
import { type AgentTurns, agentTurns, commandForTurn } from "./agent-turns.js";
import {
  CASE_SETUPS,
  type CaseSetup,
  checkoutPackages,
  isCaseSetup,
  packCommands,
  publishablePackages,
  registryTarballDir,
  setupCommands,
} from "./case-setup.js";
import { scriptedReplies } from "./case-turns.js";
import {
  configDir,
  npmrcPath,
  realConfigDir,
  seedLogin,
  VENDOR_CONFIG_DIR_VARIABLE,
} from "./isolated-agent-config.js";
import { isPlatform, isSporadicPlatform, type Platform } from "./platform-presets.js";
import {
  appendSpendRow,
  checkQuota,
  isoWeek,
  parseQuotaMarkdown,
  type QuotaLedger,
  type QuotaSpendRow,
} from "./quota.js";
import { deliveryCommands, type RegistryDelivery, stagedSnapshotIn } from "./registry-delivery.js";
import {
  isRegistryPreStep,
  REGISTRY_PRE_STEPS,
  type RegistryPreStep,
} from "./registry-pre-step.js";
import { registryProcessStarter } from "./registry-process.js";
import { assertDeterministicTiersGreen } from "./tier-precondition.js";
import {
  agentEnvironment,
  graderEnvironment,
  installStandIns,
  keepEvidence,
  recordUserTurn,
  transcriptPath,
} from "./trial-environment.js";

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

/**
 * Spawns one argv. `stdoutTo`, when given, is a file the child's standard output is APPENDED to —
 * the transcript a grader reads — while its errors stay visible to whoever started the trial.
 */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  cwd: string,
  env?: Readonly<Record<string, string>>,
  stdoutTo?: string,
) => void;

/** A resolved-path or config defect in the runner itself — never the agent's or grader's fault. */
export class HarnessError extends Error {}

/**
 * A registry's own command failed before the agent ever started, so this trial has no verdict to
 * file. Thrown, never caught into a ledger row: a red row saying "the registry path does not work"
 * when the vendor tool was simply absent, unreachable or logged out is worse than no row.
 */
export class RegistryPreStepError extends Error {}

/**
 * A case's declared setup (`case-setup.ts`) failed before the agent ever started — the same crash,
 * for the same reason: a red row saying "the skill does not work" when `dist/` was simply unbuilt or
 * the package manager was offline is worse than no row.
 */
export class CaseSetupError extends Error {}

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
  readonly spawnPreStep: SpawnFn;
  readonly scaffoldFixture: (absoluteFixtureDir: string) => string;
  /**
   * A directory EVERY trial owns, outside the project: the isolated configuration, the stand-ins,
   * the transcript, a registry case's staged snapshot and a setup's tarballs.
   */
  readonly makeWorkDir: () => string;
  /** Writes the recording `gh`/`curl` stand-ins into the work directory (`trial-environment.ts`). */
  readonly installStandIns: (workDir: string) => void;
  /** Marks the start of a turn in the transcript, with the user's own words for it. */
  readonly recordUserTurn: (workDir: string, turn: number, text: string) => void;
  /** Copies a FAILED trial's transcript and blocked-command log out of the work directory. */
  readonly keepEvidence: (workDir: string, destination: string) => void;
  /** Where every trial's evidence is kept, one directory per skill, case and trial below it. */
  readonly evidenceRoot: string;
  /** The PATH the stand-ins are put in front of. */
  readonly ambientPath: string;
  /** A fresh conversation id per trial, so three trials are three conversations. */
  readonly newSessionId: () => string;
  /** Copies the subscription login into that directory; reports whether it found one. */
  readonly seedVendorLogin: (workDir: string) => boolean;
  readonly cleanupScratch: (scratchDir: string) => void;
  readonly appendLedgerRow: (ledgerPath: string, row: Record<string, unknown>) => void;
  readonly appendQuotaSpend: (quotaPath: string, row: QuotaSpendRow) => void;
  readonly assertTiersGreen: (repoRoot: string) => void;
  readonly regeneratePromotion: () => void;
  /** The directory names under the checkout's `packages/` — what `checkout-registry` packs from. */
  readonly listPackageDirs: () => readonly string[];
  /**
   * Starts the `checkout-registry` setup's local registry over `tarballDir`, returning once it has
   * written `npmrcPath`, and returns the function that stops it.
   */
  readonly startRegistry: (tarballDir: string, npmrcPath: string) => () => void;
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
  const manifestPath = manifestPathFor(evalsDir, skill, caseName);
  const manifest = readCaseManifest(manifestPath, deps);
  if (manifest === undefined) return DEFAULT_FIXTURE;
  const { fixture } = manifest;
  if (typeof fixture !== "string" || fixture.trim() === "") {
    throw new HarnessError(
      `${manifestPath} must name its fixture as a non-empty string, got ${JSON.stringify(fixture)}`,
    );
  }
  return { relativePath: fixture, root: "package" };
}

/** What a case's own manifest may declare; every field is checked by its own reader below. */
interface CaseManifest {
  readonly fixture?: unknown;
  readonly registry?: unknown;
  readonly turns?: unknown;
  readonly setup?: unknown;
}

function manifestPathFor(evalsDir: string, skill: string, caseName: string): string {
  return join(evalsDir, skill, caseName, "case.json");
}

/**
 * A case's manifest, or `undefined` when it has none — most cases do not.
 *
 * @throws {HarnessError} when the file is there but is not readable JSON. A bare `SyntaxError` from
 * `JSON.parse` names the parser and not the file, and the operator's next question is always which
 * file.
 */
function readCaseManifest(
  manifestPath: string,
  deps: Pick<RunnerDeps, "exists" | "readFile">,
): CaseManifest | undefined {
  if (!deps.exists(manifestPath)) return undefined;
  try {
    return JSON.parse(deps.readFile(manifestPath)) as CaseManifest;
  } catch (error) {
    throw new HarnessError(`${manifestPath} is not readable JSON: ${(error as Error).message}`);
  }
}

export function resolveFixturePath(
  repoRoot: string,
  packageRoot: string,
  spec: FixtureSpec,
): string {
  return join(spec.root === "package" ? packageRoot : repoRoot, spec.relativePath);
}

/**
 * Which registry delivered this case's skill pages, read from the case's own `case.json`
 * (`"registry": "npx-skills"`), beside the fixture it names. Most cases declare none, and that is
 * the ordinary arrangement: the case is about the prompt. A case that DOES declare one is handed
 * its pages by the registry tool instead, because what such a case measures is the state a registry
 * leaves behind.
 *
 * @throws {HarnessError} when the declared id is outside {@link REGISTRY_PRE_STEPS} — never an
 * absent pre-step, because a registry case that quietly ran no pre-step would pass as a plain
 * prompt replay.
 */
export function caseRegistry(
  evalsDir: string,
  skill: string,
  caseName: string,
  deps: Pick<RunnerDeps, "exists" | "readFile">,
): RegistryPreStep | undefined {
  const manifestPath = manifestPathFor(evalsDir, skill, caseName);
  const { registry } = readCaseManifest(manifestPath, deps) ?? {};
  if (registry === undefined) return undefined;
  if (!isRegistryPreStep(registry)) {
    throw new HarnessError(
      `${manifestPath} declares "registry": ${JSON.stringify(registry)}, which is not one of ` +
        REGISTRY_PRE_STEPS.join(", "),
    );
  }
  return registry;
}

/**
 * The setup this case's `case.json` declares (`"setup": "checkout-install"`), or `undefined`.
 *
 * @throws {HarnessError} for an id outside `case-setup.ts`'s vocabulary, and for a case that also
 * names a registry: both put the skill pages in place, and a registry case whose pages our own
 * installer overwrote answers its own question.
 */
export function caseSetup(
  evalsDir: string,
  skill: string,
  caseName: string,
  deps: Pick<RunnerDeps, "exists" | "readFile">,
): CaseSetup | undefined {
  const manifestPath = manifestPathFor(evalsDir, skill, caseName);
  const { setup, registry } = readCaseManifest(manifestPath, deps) ?? {};
  if (setup === undefined) return undefined;
  if (!isCaseSetup(setup)) {
    throw new HarnessError(
      `${manifestPath} declares "setup": ${JSON.stringify(setup)}, which is not one of ${CASE_SETUPS.join(", ")}`,
    );
  }
  if (registry !== undefined) {
    throw new HarnessError(`${manifestPath} declares both a setup and a registry — choose one`);
  }
  return setup;
}

/**
 * The scripted user replies this case's `case.json` declares (`case-turns.ts`), in turn order;
 * empty for a one-turn case.
 *
 * @throws {HarnessError} for any declaration that cannot be driven as written.
 */
export function caseReplies(
  evalsDir: string,
  skill: string,
  caseName: string,
  deps: Pick<RunnerDeps, "exists" | "readFile">,
): readonly string[] {
  const manifestPath = manifestPathFor(evalsDir, skill, caseName);
  try {
    return scriptedReplies(manifestPath, readCaseManifest(manifestPath, deps)?.turns);
  } catch (error) {
    throw new HarnessError((error as Error).message);
  }
}

/**
 * Where THIS checkout's CLI is, for a grader that has to read a plan this code would make — never
 * the published one, which is a release behind the installer behaviour a registry case grades. Says
 * nothing when the shim is absent rather than naming a path that is not there; the shim itself
 * reports an unbuilt `dist/` in one line.
 */
export function cliBinEnv(
  repoRoot: string,
  exists: (path: string) => boolean,
): Record<string, string> {
  const bin = join(repoRoot, "packages", "cli", "bin", "narrativetrace.js");
  return exists(bin) ? { NARRATIVETRACE_CLI_BIN: bin } : {};
}

/** The case's own directory (prompt.md + graders/), always module/package-rooted — never cwd. */
export function resolveCaseDir(evalsDir: string, skill: string, caseName: string): string {
  return join(evalsDir, skill, caseName);
}

/** A fixture's root readme: `README`, `readme.md`, `Readme.txt` — any case, any extension. */
const ROOT_README = /^readme(\.[^/]*)?$/i;

/**
 * A fresh temp copy outside every repo tree (the study isolation rule) — never the fixture in place —
 * WITHOUT the fixture's root readme. That page documents the case for this repository (its trap,
 * what the grader reads); it is never part of the project under test. Found 2026-10-10: a verify
 * trial's agent quoted the fixture README's description of the trap back to the user (the Java
 * reference fixed the same leak in its Phase 6). A readme below the root — a dependency's page — is
 * the project's own and is kept.
 */
export function scaffoldFixture(absoluteFixtureDir: string): string {
  const scratch = mkdtempSync(join(tmpdir(), "nt-eval-"));
  const atRoot = (src: string) => relative(absoluteFixtureDir, src);
  cpSync(absoluteFixtureDir, scratch, {
    recursive: true,
    filter: (src) => !ROOT_README.test(atRoot(src)),
  });
  return scratch;
}

export function cleanupScratch(scratchDir: string): void {
  rmSync(scratchDir, { recursive: true, force: true });
}

/**
 * A registry trial's own work directory, with the staged tree's parent already there: `tar -C` needs
 * the directory to exist, and the registry tool must see a tree rather than a tarball.
 */
export function makeWorkDir(): string {
  const work = mkdtempSync(join(tmpdir(), "nt-eval-work-"));
  mkdirSync(stagedSnapshotIn(work));
  return work;
}

/**
 * Copies the subscription login out of the ambient configuration into `workDir`'s own. `HOME` is
 * asked before the runtime's `homedir()`: this container's uid has no passwd entry, so `homedir()`
 * answers with a path that holds no login, which reaches the operator as "Not logged in" two steps
 * later.
 */
export function seedVendorLogin(workDir: string): boolean {
  const real = realConfigDir(process.env[VENDOR_CONFIG_DIR_VARIABLE], process.env.HOME, homedir());
  return seedLogin(real, workDir);
}

/**
 * The production {@link SpawnFn}. A RECORDED command (an agent turn) gets no standard input: its
 * input is its prompt argv and nothing else, and an inherited pipe nobody closes would leave a CLI
 * that reads a piped stdin waiting for ever.
 */
export function spawnInherit(
  command: string,
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>> = {},
  stdoutTo?: string,
): void {
  const out = stdoutTo === undefined ? "inherit" : openSync(stdoutTo, "a");
  const stdin = stdoutTo === undefined ? "inherit" : "ignore";
  try {
    execFileSync(command, args, {
      cwd,
      stdio: [stdin, out, "inherit"],
      env: { ...process.env, ...env },
    });
  } finally {
    if (typeof out === "number") closeSync(out);
  }
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
  env: Readonly<Record<string, string>> = {},
): "pass" | "fail" {
  const scriptPath = join(caseDir, "graders", "verify.sh");
  if (!exists(scriptPath)) {
    throw new HarnessError(`grader script not found at ${scriptPath}`);
  }
  try {
    spawn("sh", [scriptPath], cwd, env);
    return "pass";
  } catch {
    return "fail";
  }
}

/**
 * Spawns one agent turn from its template (`agent-turns.ts`'s {@link commandForTurn}) with the
 * prompt as ONE argv element — see `agent-command.ts` for why this, and never a shell string, is
 * what keeps a backtick/`$(...)`/quote/newline in the prompt from being parsed as shell syntax.
 */
export function runAgentTurn(
  template: string,
  prompt: string,
  cwd: string,
  spawn: SpawnFn,
  env: Readonly<Record<string, string>> = {},
  stdoutTo?: string,
): void {
  const [command, ...rest] = buildAgentArgv(template, prompt);
  if (!command) throw new HarnessError(`--agent-command produced an empty argv: "${template}"`);
  spawn(command, rest, cwd, env, stdoutTo);
}

/**
 * Every turn in order: the user's words into the transcript FIRST, then the agent's turn with its
 * standard output appended after them. A turn that throws stops the conversation, so no later turn
 * runs and the grader never does — a second turn driven after a failed first is an approval
 * answering a question that was never asked.
 */
function driveTheConversation(
  turns: AgentTurns,
  cwd: string,
  workDir: string,
  deps: RunnerDeps,
): void {
  if (turns.firstTurnCommand === undefined) {
    console.log("(no --agent-command given — skipping the agent step, grading the fixture as-is)");
    return;
  }
  const env = agentEnvironment(workDir, deps.ambientPath);
  turns.prompts.forEach((prompt, index) => {
    deps.recordUserTurn(workDir, index + 1, prompt);
    const template = commandForTurn(turns, index + 1) as string;
    runAgentTurn(template, prompt, cwd, deps.spawnAgent, env, transcriptPath(workDir));
  });
}

interface TrialOutcome {
  readonly result: "pass" | "fail";
  readonly note?: string;
}

/** Tags a caught throw so the ledger row can tell a harness bug from an agent crash (both "fail"). */
function runTrialBody(
  turns: AgentTurns,
  plan: CasePlan,
  cwd: string,
  workDir: string,
  deps: RunnerDeps,
): TrialOutcome {
  try {
    driveTheConversation(turns, cwd, workDir, deps);
    const graderEnv = {
      ...graderEnvironment(workDir, deps.ambientPath),
      ...cliBinEnv(deps.repoRoot, deps.exists),
    };
    return { result: runGrader(plan.caseDir, cwd, deps.spawnGrader, deps.exists, graderEnv) };
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

/** What every trial of the requested case needs and what no trial of it changes. */
interface CasePlan {
  readonly caseDir: string;
  readonly fixtureDir: string;
  readonly prompt: string;
  readonly replies: readonly string[];
  readonly preStep: RegistryPreStep | undefined;
  readonly setup: CaseSetup | undefined;
}

/**
 * The registry's own delivery, before the agent starts: the staged snapshot, then the documented
 * commands a reader runs, in the project itself and against the trial's own configuration.
 *
 * @throws {RegistryPreStepError} if any of them fails — the trial CRASHED rather than failed, so it
 * leaves no ledger row.
 */
function runPreStep(delivery: RegistryDelivery | undefined, cwd: string, deps: RunnerDeps): void {
  if (delivery === undefined) return;
  console.log(`registry pre-step: ${delivery.preStep}`);
  for (const command of deliveryCommands(delivery, deps.repoRoot)) {
    spawnOrCrash(command, cwd, delivery.workDir, deps, RegistryPreStepError, "registry pre-step");
  }
}

/**
 * The case's declared setup, in the project, before the agent starts (`case-setup.ts`): which
 * packages to pack is read from the FIXTURE's own `package.json`, so the case says what it needs in
 * the one file a reader of the fixture already reads.
 *
 * @throws {CaseSetupError} if any command fails — a crash, so no ledger row.
 */
function runSetup(
  args: RunArgs,
  plan: CasePlan,
  cwd: string,
  workDir: string,
  deps: RunnerDeps,
): () => void {
  if (plan.setup === undefined) return () => {};
  const readJson = (path: string): unknown => JSON.parse(deps.readFile(path));
  if (plan.setup === "checkout-registry") return runRegistrySetup(cwd, workDir, deps, readJson);
  const fixture = readJson(join(plan.fixtureDir, "package.json")) as Record<string, never>;
  const packages = checkoutPackages(fixture, deps.repoRoot, readJson);
  console.log(`case setup: ${plan.setup} — ${packages.map((pkg) => pkg.name).join(", ")}`);
  for (const { argv, cwd: at } of setupCommands(packages, workDir, cwd, args.platform)) {
    spawnOrCrash(argv, at, workDir, deps, CaseSetupError, "case setup");
  }
  return () => {};
}

/**
 * `checkout-registry`: every publishable package packed into the work directory, the local
 * registry serving them (it writes the trial's npmrc), then the project's OWN dependencies
 * installed — an existing project has its `node_modules` — through that npmrc. Returns what stops
 * the registry.
 *
 * @throws {CaseSetupError} if a pack, the registry or the install fails — a crash, no ledger row;
 * a registry already started is stopped first.
 */
function runRegistrySetup(
  project: string,
  workDir: string,
  deps: RunnerDeps,
  readJson: (path: string) => unknown,
): () => void {
  const packages = publishablePackages(deps.repoRoot, deps.listPackageDirs, readJson);
  console.log(`case setup: checkout-registry — ${packages.length} packages`);
  for (const { argv, cwd: at } of packCommands(packages, workDir)) {
    spawnOrCrash(argv, at, workDir, deps, CaseSetupError, "case setup");
  }
  const stop = startRegistryOrCrash(workDir, deps);
  try {
    spawnOrCrash(PROJECT_INSTALL, project, workDir, deps, CaseSetupError, "case setup");
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

/** The project's own dependencies, as its owner installed them. */
const PROJECT_INSTALL = ["npm", "install", "--no-audit", "--no-fund"] as const;

function startRegistryOrCrash(workDir: string, deps: RunnerDeps): () => void {
  try {
    return deps.startRegistry(registryTarballDir(workDir), npmrcPath(workDir));
  } catch (error) {
    const message = (error as Error).message;
    throw new CaseSetupError(`case setup failed: the local registry did not start — ${message}`);
  }
}

/**
 * One command run before the agent, its failure translated into the one error that leaves no
 * ledger row — naming the command, because the whole value of crashing here is that the operator
 * reads the cause at the cause's own site rather than as a red row three days later.
 */
function spawnOrCrash(
  command: readonly string[],
  cwd: string,
  workDir: string,
  deps: RunnerDeps,
  crash: new (message: string) => Error,
  what: string,
): void {
  const [executable, ...rest] = command;
  try {
    deps.spawnPreStep(executable as string, rest, cwd, agentEnvironment(workDir, deps.ambientPath));
  } catch (error) {
    throw new crash(`${what} failed: ${command.join(" ")} — ${(error as Error).message}`);
  }
}

/** Says where the trial's own configuration is and whether it has a login at all. */
function announceIsolation(workDir: string, seeded: boolean): void {
  console.log(
    `isolated vendor configuration under ${configDir(workDir)}` +
      (seeded
        ? " (subscription login seeded)"
        : " (NO login found — the agent may refuse to start)"),
  );
}

/**
 * Everything a trial needs before its agent starts, in the work directory it owns: the stand-ins,
 * the throwaway configuration with the login seeded, then a registry's delivery or a case's setup.
 */
function prepareTrial(
  args: RunArgs,
  plan: CasePlan,
  scratch: string,
  workDir: string,
  deps: RunnerDeps,
): () => void {
  deps.installStandIns(workDir);
  announceIsolation(workDir, deps.seedVendorLogin(workDir));
  const delivery = plan.preStep === undefined ? undefined : { preStep: plan.preStep, workDir };
  runPreStep(delivery, scratch, deps);
  return runSetup(args, plan, scratch, workDir, deps);
}

/** What drives THIS trial: the case's turns under a conversation id of the trial's own. */
function turnsFor(args: RunArgs, plan: CasePlan, deps: RunnerDeps): AgentTurns {
  try {
    return agentTurns({
      platform: args.platform,
      model: args.model,
      skill: args.skill,
      override: args.agentCommand,
      firstPrompt: plan.prompt,
      replies: plan.replies,
      sessionId: deps.newSessionId(),
    });
  } catch (error) {
    throw new HarnessError((error as Error).message);
  }
}

/**
 * A trial's evidence, kept where an operator can read it after the work directory is gone — under
 * the time the trial ended, so a later run of the same case can never overwrite the record of an
 * earlier one (it did, on the second feedback trial of 2026-10-08). A passing trial's is kept too,
 * suffixed `-pass` (Java cross-port item 8): a green row is a claim, and reading why it passed is
 * how a grader rule that passes too much is found.
 */
function keepTrialEvidence(
  args: RunArgs,
  trial: number,
  result: string,
  workDir: string,
  deps: RunnerDeps,
): void {
  const stamp = deps.now().toISOString().replaceAll(":", "-");
  const suffix = result === "pass" ? "-pass" : "";
  const destination = join(
    deps.evidenceRoot,
    args.skill,
    args.caseName,
    `${stamp}-trial-${trial}${suffix}`,
  );
  deps.keepEvidence(workDir, destination);
  console.log(`evidence kept: ${destination}`);
}

/**
 * One trial, in two throwaway directories outside every repository tree — the scratch project the
 * agent works in, and the work directory holding everything the agent must not see or must not
 * share with the operator — both deleted whatever the outcome. The turns are built FIRST: a case
 * this platform cannot drive crashes before anything is scaffolded, never as a red row.
 */
function runOneTrial(args: RunArgs, plan: CasePlan, trial: number, deps: RunnerDeps): TrialOutcome {
  const turns = turnsFor(args, plan, deps);
  const scratch = deps.scaffoldFixture(plan.fixtureDir);
  const workDir = deps.makeWorkDir();
  let teardown = () => {};
  try {
    teardown = prepareTrial(args, plan, scratch, workDir, deps);
    const outcome = runTrialBody(turns, plan, scratch, workDir, deps);
    keepTrialEvidence(args, trial, outcome.result, workDir, deps);
    deps.appendLedgerRow(deps.ledgerPath, ledgerRow(args, trial, deps.now(), outcome));
    deps.regeneratePromotion();
    console.log(`trial ${trial}/${args.trials}: ${outcome.result}`);
    return outcome;
  } finally {
    teardown();
    deps.cleanupScratch(scratch);
    deps.cleanupScratch(workDir);
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

  const plan = casePlan(args, deps);
  const sessionSpend: QuotaSpendRow[] = [];
  for (let trial = 1; trial <= args.trials; trial++) {
    if (isSporadicPlatform(args.platform)) assertQuotaAvailable(args.platform, sessionSpend, deps);
    runOneTrial(args, plan, trial, deps);
    if (isSporadicPlatform(args.platform)) sessionSpend.push(recordSporadicSpend(args, deps));
  }
}

/**
 * Reads the case directory once, before any trial: its prompt, its fixture, and the registry that
 * delivers its pages. A `case.json` naming a registry outside the vocabulary therefore crashes
 * before anything is scaffolded.
 */
function casePlan(args: RunArgs, deps: RunnerDeps): CasePlan {
  const caseDir = resolveCaseDir(deps.evalsDir, args.skill, args.caseName);
  const promptPath = join(caseDir, "prompt.md");
  if (!deps.exists(promptPath)) throw new Error(`No case found at ${caseDir}`);
  const spec = caseFixtureSpec(deps.evalsDir, args.skill, args.caseName, deps);
  return {
    caseDir,
    fixtureDir: resolveFixturePath(deps.repoRoot, deps.packageRoot, spec),
    prompt: deps.readFile(promptPath),
    replies: caseReplies(deps.evalsDir, args.skill, args.caseName, deps),
    preStep: caseRegistry(deps.evalsDir, args.skill, args.caseName, deps),
    setup: caseSetup(deps.evalsDir, args.skill, args.caseName, deps),
  };
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
    spawnPreStep: spawnInherit,
    scaffoldFixture,
    makeWorkDir,
    installStandIns,
    recordUserTurn,
    keepEvidence,
    evidenceRoot: join(packageRoot, ".evals-evidence"),
    ambientPath: process.env.PATH ?? "",
    newSessionId: randomUUID,
    seedVendorLogin,
    cleanupScratch,
    appendLedgerRow: (path, row) => appendFileSync(path, `${JSON.stringify(row)}\n`),
    appendQuotaSpend: appendSpendRow,
    assertTiersGreen: assertDeterministicTiersGreen,
    regeneratePromotion: () => regeneratePromotionInPlace(repoRoot),
    listPackageDirs: () => readdirSync(join(repoRoot, "packages")),
    startRegistry: registryProcessStarter(evalsDir),
  };
}

/** The CLI entry point (`run.ts`) — `evalsDir` is that file's own `import.meta.dirname`. */
export function runCli(argv: readonly string[], evalsDir: string): void {
  runTrials(parseArgs(argv), productionDeps(evalsDir));
}
