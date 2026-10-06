// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  applyPlan,
  type Carrier,
  carrierVersionWarning,
  type DoctorSnapshot,
  type Env,
  type InitPlan,
  type ProjectState,
  planExitCode,
  planInstall,
  planUninstall,
  readProjectState,
  renderHuman,
  renderJson,
  renderPlan,
  renderReport,
  reportExitCode,
  runDoctor,
} from "@narrativetrace/tooling";
import { type InstallerArguments, parseInstallerArguments } from "./installer-arguments.js";

const USAGE = `narrativetrace — one CLI over NarrativeTrace's open artifact formats

Usage:
  narrativetrace doctor [--json]
  narrativetrace init [--dry-run] [--write-existing] [--force] [--only <half>] [--vendor <vendor>]
                      [--from <dir>] [--json]
  narrativetrace uninstall [--dry-run] [--only <half>] [--json]

Commands:
  doctor     Read-only project diagnosis: toolchain, configuration, and known traps. Zero network.
  init       Installs the NarrativeTrace agent skills and the AGENTS.md section into this project.
  uninstall  Removes exactly what init wrote, and nothing beside it.

Options:
  --json    Machine-readable output instead of human text.
  --help    Show this message.`;

const DOCTOR_USAGE = `narrativetrace doctor [--json]

Read-only. Checks toolchain/install state, configuration, and known traps against the current
project. Exit 0 = clean, 1 = findings, 2 = could not run.`;

const INSTALLER_OPTIONS = `  --dry-run         Show the plan and the unified diff. Writes nothing, always exits 0.
  --write-existing  Permission to touch an AGENTS.md or CLAUDE.md that is already there.
  --force           Permission to overwrite a skill directory somebody else owns.
  --only <half>     skills | agents-md. Both halves by default.
  --vendor <vendor> claude | none. Detected from the project by default.
  --from <dir>      A directory holding the carrier: a checked-out @narrativetrace/skills, or an
                    unpacked tarball of one. The copy bundled with this CLI by default.
  --json            Machine-readable output instead of human text.

Exit 0 = applied (or a dry run), 1 = something was refused, 2 = could not run.`;

const INIT_USAGE = `narrativetrace init [options]

Copies the NarrativeTrace agent skills into .agents/skills/ (and .claude/skills/ where the project
is one of that vendor's) and writes one marked section into AGENTS.md. Zero network.

Run it again to refresh: this CLI installs no build hook and schedules nothing, so a re-run IS the
refresh. On a project that already carries the skills it rewrites only our own pages and our own
marked section, and leaves everything else where it is.

${INSTALLER_OPTIONS}`;

/**
 * Only the three flags an uninstall uses, plus one line about the rest.
 *
 * @llmNote Java's uninstall help prints the install-only flags too, which makes its own help untrue
 * about `--force` and `--from`. The parser is still shared — one flag reader for both verbs — so the
 * flags stay ACCEPTED; they are simply not advertised where they do nothing.
 */
const UNINSTALL_OPTIONS = `  --dry-run         Show the plan and the unified diff. Removes nothing, always exits 0.
  --only <half>     skills | agents-md. Both halves by default.
  --json            Machine-readable output instead of human text.

The install-only flags (--write-existing, --force, --vendor, --from) are accepted and ignored: there
is no carrier to open and no permission to ask for when removing what this tool itself wrote.

Exit 0 = removed (or a dry run), 1 = something was refused, 2 = could not run.`;

const UNINSTALL_USAGE = `narrativetrace uninstall [options]

Removes exactly what init wrote: skill directories carrying its provenance line, the marked
section, and the one @AGENTS.md import line. Never touches anything else.

${UNINSTALL_OPTIONS}`;

/** What to type when no carrier could be opened — this CLI never fetches one. */
const CARRIER_HINT = `Nothing was fetched: this command makes no network call. Point --from at a carrier you have:
  --from node_modules/@narrativetrace/skills
  npm pack @narrativetrace/skills && tar xzf narrativetrace-skills-*.tgz && narrativetrace init --from package`;

/** Everything the launcher reads from the outside world, injectable for hermetic tests. */
export interface CliDeps {
  readonly cwd: string;
  readonly env: Env;
  readonly buildSnapshot: (cwd: string, env: Env) => DoctorSnapshot;
  /** Opens the carrier a run installs from; `from` is whatever `--from` named, or `undefined`. */
  readonly openCarrier: (from: string | undefined) => Carrier;
  /** One line of human text. */
  readonly log: (message: string) => void;
  /** A rendered report, verbatim — it brings its own trailing newline. */
  readonly print: (text: string) => void;
  /** One line of diagnosis: a usage error, a refusal's reason, or the version note. */
  readonly error: (message: string) => void;
}

/** Runs `doctor` once argv has been recognized as that command. Returns the process exit code. */
function runDoctorCommand(rest: readonly string[], deps: CliDeps): number {
  if (rest.includes("--help") || rest.includes("-h")) {
    deps.log(DOCTOR_USAGE);
    return 0;
  }
  const json = rest.includes("--json");
  const unknown = rest.filter((arg) => arg !== "--json");
  if (unknown.length > 0) {
    deps.error(`Unknown argument(s) for doctor: ${unknown.join(", ")}\n\n${DOCTOR_USAGE}`);
    return 2;
  }
  const snapshot = deps.buildSnapshot(deps.cwd, deps.env);
  if (!snapshot.rootPackageJson) {
    deps.error(`Could not run: no readable package.json found at ${deps.cwd}`);
    return 2;
  }
  const report = runDoctor(snapshot);
  deps.log(json ? renderJson(report) : renderHuman(report));
  return report.exitCode;
}

/**
 * What the plan did, or what it would do.
 *
 * @llmNote Both forms come from the library's own `renderPlan`/`renderReport`, so this launcher and
 * any later entry point cannot drift apart on what a dry run shows. A dry run is never applied: the
 * executor refuses one outright, and the exit code is 0 even when something was refused (D12).
 */
function report(plan: InitPlan, parsed: InstallerArguments, deps: CliDeps): number {
  const options = { json: parsed.json };
  if (parsed.options.dryRun) {
    deps.print(renderPlan(plan, options));
    return planExitCode(plan);
  }
  const executed = applyPlan(plan, deps.cwd);
  deps.print(renderReport(executed, options));
  return reportExitCode(executed);
}

/**
 * The shared ending of both verbs: read the project once, plan, then show or apply.
 *
 * @llmNote A project that cannot be read is exit 1, not 2: the command was typed correctly, it could
 * not do the work. Exit 2 is reserved for a command line nobody could act on.
 */
function runPlan(
  planner: (state: ProjectState) => InitPlan,
  parsed: InstallerArguments,
  deps: CliDeps,
): number {
  try {
    return report(planner(readProjectState(deps.cwd, deps.env)), parsed, deps);
  } catch (cause) {
    deps.error((cause as Error).message);
    return 1;
  }
}

/**
 * D4's one line, on stderr: the pages about to land belong to a different release than the project
 * resolves. A note, never a refusal — and never on stdout, which carries the report alone so that
 * `--json` stays parseable and a human still sees this in a terminal.
 */
function noteVersions(carrier: Carrier, state: ProjectState, deps: CliDeps): void {
  const warning = carrierVersionWarning(carrier, state);
  if (warning !== undefined) deps.error(warning);
}

/**
 * The carrier is opened BEFORE the project is read: a run that cannot find its skills has nothing to
 * plan, and finding that out after walking the project would only delay the same message.
 */
function runInit(parsed: InstallerArguments, deps: CliDeps): number {
  let carrier: Carrier;
  try {
    carrier = deps.openCarrier(parsed.from);
  } catch (cause) {
    deps.error(`${(cause as Error).message}\n\n${CARRIER_HINT}`);
    return 1;
  }
  return runPlan(
    (state) => {
      noteVersions(carrier, state, deps);
      return planInstall(state, carrier, parsed.options);
    },
    parsed,
    deps,
  );
}

/** The two installer verbs: same flags, same output, one plans an install and one its removal. */
function runInstaller(install: boolean, rest: readonly string[], deps: CliDeps): number {
  const parsed = parseInstallerArguments(rest);
  const usage = install ? INIT_USAGE : UNINSTALL_USAGE;
  if (parsed.help) {
    deps.log(usage);
    return 0;
  }
  if (parsed.error !== undefined) {
    deps.error(`${parsed.error}\n\n${usage}`);
    return 2;
  }
  return install
    ? runInit(parsed, deps)
    : runPlan((state) => planUninstall(state, parsed.options), parsed, deps);
}

/** Parses argv and runs the requested command. Returns the process exit code. */
export function runCli(argv: string[], deps: CliDeps): number {
  const [verb, ...rest] = argv;
  if (verb === undefined) {
    deps.error(USAGE);
    return 2;
  }
  if (verb === "--help" || verb === "-h") {
    deps.log(USAGE);
    return 0;
  }
  if (verb === "doctor") return runDoctorCommand(rest, deps);
  if (verb === "init" || verb === "uninstall") {
    return runInstaller(verb === "init", rest, deps);
  }
  deps.error(`Unknown command: ${verb}\n\n${USAGE}`);
  return 2;
}
