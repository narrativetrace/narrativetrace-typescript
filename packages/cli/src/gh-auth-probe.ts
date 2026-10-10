// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { spawnSync } from "node:child_process";

/**
 * Asks an already-installed `gh` whether it is signed in — the one question that decides whether
 * the `gh` channel is offered at all.
 *
 * INTENT: `gh issue create` is the convenience path, and offering it to somebody who has no `gh`, or
 * an unauthenticated one, is offering them an error message. `gh auth status` answers exactly that
 * question, using that tool's own credential; this launcher holds none and never will.
 *
 * @llmNote The probe is the ONLY outward-facing thing this launcher's own process causes, and it
 * causes it indirectly: `gh` validates its token against the host. That is the user's tool making
 * the user's call. The launcher still makes no request of its own, holds no credential and files
 * nothing — which is the invariant this note exists to keep honest.
 *
 * @llmNote Absence, a non-zero exit, a timeout and a platform that cannot start a process at all
 * answer the SAME way: not available. An unavailable channel is a fact, never an error — the verb
 * says "use the URL instead" and exits 1.
 *
 * @llmNote {@link ProbeRunner} is the seam, for the same reason `CliDeps` is one: the DECISION —
 * which outcomes mean "signed in" — is the part worth testing, and testing it by installing a tool
 * is testing the machine instead. {@link ghAuthStatus} is the one line that touches a real process,
 * and this module is the one entry point that holds it. A second copy of this probe anywhere would
 * be a second thing to keep true.
 *
 * @sideEffects {@link ghAuthenticated} starts one short-lived subprocess, with its output discarded.
 * {@link ghAuthenticatedBy} starts nothing.
 */

/** Long enough for a token check, short enough that nobody waits on a wedged network. */
const TIMEOUT_MS = 10_000;

/**
 * What one probe run reports back.
 *
 * @param status the exit status, or `null` when the process never ran or was killed.
 * @param error why it never ran, or `undefined` when it did — a timeout arrives here too.
 */
export interface ProbeResult {
  readonly status: number | null;
  readonly error?: Error | undefined;
}

/** Runs the probe. The real one runs `gh auth status`; a test hands back a result instead. */
export type ProbeRunner = () => ProbeResult;

/**
 * The decision, over whatever ran the probe: signed in means the tool ran AND exited zero.
 *
 * Any doubt answers false — an absent tool, a non-zero exit, a timeout, and a runner that threw
 * because the platform cannot start a process at all.
 */
export function ghAuthenticatedBy(run: ProbeRunner): boolean {
  try {
    const result = run();
    return result.error === undefined && result.status === 0;
  } catch {
    return false;
  }
}

/* v8 ignore start -- the two functions below are the only code in this package that starts a
   process, and covering them means starting one. The DECISION they feed is `ghAuthenticatedBy`
   above, which is covered six ways; what is left here is a fixed argv and one call, and a test that
   exercised it would be a test of whether this machine has `gh` installed. */
/* Stryker disable all: same reason as the coverage exclusion above — every mutant here (the argv,
   the two spawn options, the result shape) can only be killed by starting a process, so leaving
   them in the report would be ten permanent survivors standing in for a decision nobody made. */

/**
 * The real probe. A fixed argv of three literals — nothing a project, a flag or a report can reach,
 * which is what makes this one line safe to have at all. `shell` is off, so there is no shell to
 * interpret anything either.
 */
function ghAuthStatus(): ProbeResult {
  const probe = spawnSync("gh", ["auth", "status"], {
    timeout: TIMEOUT_MS,
    stdio: "ignore",
    shell: false,
  });
  return { status: probe.status, error: probe.error };
}

/** Whether `gh` is present AND signed in, asked of the real tool. */
export function ghAuthenticated(): boolean {
  return ghAuthenticatedBy(ghAuthStatus);
}

/* Stryker restore all */
/* v8 ignore stop */
