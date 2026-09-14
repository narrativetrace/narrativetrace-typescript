// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { execFileSync } from "node:child_process";
import { tokenizeCommandTemplate } from "./agent-command.js";

/**
 * Sporadic-lanes policy, rule 3 (skill-evals-multi-platform-2026-09-13.md, owner-ruled
 * 2026-09-13): "Deterministic tiers first, always. A cheaper-lane run refuses to start unless the
 * skill's Tier A lints and Tier A2 replay are green at HEAD — a Tier B trial on a skill whose
 * replay is red is quota burned on a known defect." `run` is injectable (the `replay.ts` idiom in
 * this same package) so a unit test can fake the command without a real vitest run.
 */
export type RunCommand = (command: string, args: readonly string[], cwd: string) => void;

export function runCommand(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: "pipe" });
}

const TIER_A_AND_A2_FILES = ["__tests__/lints.test.ts", "__tests__/replay.test.ts"] as const;

/**
 * The host/container split (2026-09-14 defect): a sporadic-lane CLI (`codex`, `gemini`) lives only
 * on the host, but the toolchain this precondition runs (`pnpm`/`vitest`, and everything the Tier
 * A2 replay's "install with the real toolchain" step needs) lives only in the dev container's own
 * `node_modules` — a host `pnpm install` there aborts (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
 * Set this to an exec prefix (e.g. `docker exec -w /workspace narrativetrace-dev`) to run the guard
 * where the toolchain actually is; unset runs it locally, as before.
 */
export const TOOLCHAIN_EXEC_ENV_VAR = "NARRATIVETRACE_EVAL_TOOLCHAIN_EXEC";

interface PreconditionCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** Named in the failure message — never left implicit, so a red run says where it ran. */
  readonly where: string;
}

/**
 * Builds the Tier A/A2 command, `toolchainExec`'s tokens (tokenised with `agent-command.ts`'s own
 * tokeniser — never string-spliced into a shell) prepended to the argv when set. `undefined`/empty
 * runs the suite locally, unchanged from before this seam existed.
 */
export function preconditionCommand(toolchainExec: string | undefined): PreconditionCommand {
  const suite = [
    "pnpm",
    "--filter",
    "@narrativetrace/skills",
    "exec",
    "vitest",
    "run",
    ...TIER_A_AND_A2_FILES,
  ];
  if (!toolchainExec) return { command: "pnpm", args: suite.slice(1), where: "locally" };
  const [command, ...rest] = [...tokenizeCommandTemplate(toolchainExec), ...suite];
  return { command: command as string, args: rest, where: `via \`${toolchainExec}\`` };
}

/** Throws with a quota-preserving explanation when the skills package's Tier A/A2 suite is red. */
export function assertDeterministicTiersGreen(
  repoRoot: string,
  run: RunCommand = runCommand,
  toolchainExec: string | undefined = process.env[TOOLCHAIN_EXEC_ENV_VAR],
): void {
  const { command, args, where } = preconditionCommand(toolchainExec);
  try {
    run(command, args, repoRoot);
  } catch (error) {
    throw new Error(
      `Tier A lints / Tier A2 replay are not green (ran ${where}) for @narrativetrace/skills — a ` +
        "sporadic-lane (codex/gemini) trial refuses to start on top of a known defect. Fix " +
        "packages/skills' own tests before spending quota here.",
      { cause: error },
    );
  }
}
