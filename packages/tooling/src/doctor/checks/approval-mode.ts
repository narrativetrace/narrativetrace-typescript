// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { withoutComments } from "../../frameworks/source-text.js";
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck, DoctorSnapshot, PackageJsonLike } from "../types.js";

const ID = "config.approval-mode";

const KEY = "NARRATIVETRACE_APPROVAL";

const FIX =
  "Turn approval mode on: set NARRATIVETRACE_APPROVAL=true for the test run (in the package.json " +
  'test script, or the vitest config\'s test.env), or "approval": "true" in narrativetrace.config.json, ' +
  "or createNarrativeTest({ approval: true }) — then run the tests: a run whose structure differs " +
  "from its baseline fails and writes a .received.nt to review.";

/**
 * The fixture option as live code spells it once whitespace is removed and case folded —
 * `approval: true` — bounded on both sides, so `preapproval: true` and `approval: trueish` are not
 * the switch. Counted only in a file that imports `@narrativetrace/vitest`: `{ approval: true }`
 * is an ordinary thing for application code to say.
 */
const OPTION_ON = /(?<![\w$])approval:true(?![\w$])/;

/**
 * The environment variable set to `true` in code (`process.env.X = "true"`, a vitest `test.env`
 * entry) or in a script (`X=true vitest`), quoted or not, case as the runtime reads it.
 */
const ENV_ON =
  /(?<![\w$])narrativetrace_approval\s*(?:[:=]|\?\?=|\|\|=)\s*["'`]?true["'`]?(?![\w$])/i;

/**
 * A string literal's contents, emptied: the option is a boolean, so `approval: true` inside a
 * string — a test asserting on help text — is never the switch (adversarial pass, 2026-10-10).
 */
const STRING_LITERAL = /(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g;

/**
 * `config.approval-mode` — committed `.approved.nt` baselines, with approval mode off. Port of
 * Java `ApprovalModeCheck`.
 *
 * INTENT: a baseline is the durable form of what a flow is supposed to do, and it only guards
 * anything while a run compares against it. With approval mode off the tests pass whatever the
 * structure does, so a committed baseline reads as protection the project does not have. The
 * verify skill's pin step is the one place an agent turns it on; this check is what tells it to.
 *
 * @llmNote "On" is read where this runtime's switch is actually thrown, the way the runtime reads
 * it: `NARRATIVETRACE_APPROVAL` (trimmed, any case, `"true"`) wins over the config file's STRING
 * `"approval": "true"` (a JSON boolean is ignored by `resolveConfig`, so it is ignored here); the
 * fixture option `approval: true` in a file that imports `@narrativetrace/vitest`; the same
 * variable set in live code or in any manifest's npm script. Code is read through
 * `withoutComments` — a commented-out switch is not a switch. A `.received.nt` alone is not a
 * baseline: it is what a first approval run writes.
 */
export const checkApprovalMode: DoctorCheck = (snapshot) => {
  const baselines = [...snapshot.approvedDirFiles.keys()].some((p) => p.endsWith(".approved.nt"));
  if (!baselines) {
    const message = "No .approved.nt baselines — nothing for approval mode to compare yet";
    return pass(ID, message, DOC.approvalTracesEndToEnd);
  }
  if (switchedOn(snapshot)) {
    const message =
      ".approved.nt baselines exist and approval mode is on — every run compares them";
    return pass(ID, message, DOC.approvalTracesEndToEnd);
  }
  const message = ".approved.nt baselines exist but approval mode is off — nothing compares them";
  return fail(ID, message, FIX, DOC.approvalTracesEndToEnd);
};

function switchedOn(snapshot: DoctorSnapshot): boolean {
  return channelOn(snapshot) || codeOn(snapshot.sourceFiles) || scriptsOn(snapshot);
}

/** The environment, else the config file's string setting — `resolveConfig`'s own precedence. */
function channelOn(snapshot: DoctorSnapshot): boolean {
  const fromEnv = snapshot.env[KEY];
  const value = fromEnv ? fromEnv : configSetting(snapshot.projectConfig);
  return value?.trim().toLowerCase() === "true";
}

function configSetting(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    const value = (parsed as Record<string, unknown> | null)?.approval;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function codeOn(sourceFiles: ReadonlyMap<string, string>): boolean {
  for (const source of sourceFiles.values()) {
    const live = withoutComments(source);
    if (ENV_ON.test(live)) return true;
    const isFixture = live.includes("@narrativetrace/vitest");
    const code = live.replace(STRING_LITERAL, '""');
    if (isFixture && OPTION_ON.test(code.replace(/\s+/g, "").toLowerCase())) return true;
  }
  return false;
}

function scriptsOn(snapshot: DoctorSnapshot): boolean {
  const manifests: (PackageJsonLike | undefined)[] = [
    snapshot.rootPackageJson,
    ...snapshot.manifests.values(),
  ];
  return manifests.some((manifest) =>
    Object.values(manifest?.scripts ?? {}).some((script) => ENV_ON.test(script)),
  );
}
