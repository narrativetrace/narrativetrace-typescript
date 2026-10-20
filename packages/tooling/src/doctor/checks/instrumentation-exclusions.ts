// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { DOC } from "../doc-urls.js";
import { fail, pass } from "../finding.js";
import type { DoctorCheck } from "../types.js";

const ID = "config.instrumentation-exclusions";
const ENV_KEY = "NARRATIVETRACE_EXCLUDE";
const SEPARATORS = /[;,]/;
const TRAILING_WILDCARD = /[./]\*{0,2}$/;
const FIX =
  "Fix NARRATIVETRACE_EXCLUDE: a ';' or ',' separated list of class-name prefixes, no blank entry, none twice. " +
  "Unset it to use the shipped default, or set it to the empty string to exclude nothing.";

/**
 * The shipped default of `exclude` (list 2), as `@narrativetrace/core`'s `DEFAULT_EXCLUDE` carries
 * it. The doctor imports nothing, so this is a copy — pinned to the runtime's constant, member for
 * member, by `__tests__/doctor-exclusions-parity.test.ts` at the repository root.
 */
export const SHIPPED_DEFAULT: readonly string[] = [
  "ModuleRef",
  "Reflector",
  "MetadataScanner",
  "DiscoveryService",
];

// The runtime's grammar (core's parseExclude), returning the first complaint instead of throwing.
function parse(raw: string): { prefixes: string[] } | { problem: string } {
  const prefixes: string[] = [];
  for (const entry of raw === "" ? [] : raw.split(SEPARATORS)) {
    const prefix = entry.trim().replace(TRAILING_WILDCARD, "");
    if (prefix === "") return { problem: `a blank entry (${JSON.stringify(entry)})` };
    if (prefixes.includes(prefix)) return { problem: `a duplicate entry "${prefix}"` };
    prefixes.push(prefix);
  }
  return { prefixes };
}

/**
 * Reports the exclude list the runtime will apply — `NARRATIVETRACE_EXCLUDE` when set (replacing
 * the shipped default), else the shipped default — and fails when the variable is invalid, because
 * the runtime then ignores the whole value and silently applies the default instead of what was
 * asked for. Options passed in code (`traceObject`'s `exclude`, the NestJS module's) are not
 * visible to the doctor; it reads the environment only.
 */
export const checkInstrumentationExclusions: DoctorCheck = (snapshot) => {
  const raw = snapshot.env[ENV_KEY];
  if (raw === undefined) {
    const message = `the exclude list in force is the shipped default: ${SHIPPED_DEFAULT.join(", ")}`;
    return pass(ID, message, DOC.instrumentationExclusions);
  }
  const parsed = parse(raw);
  if ("problem" in parsed) {
    const message = `${ENV_KEY} has ${parsed.problem} — the runtime ignores the whole value and applies the shipped default`;
    return fail(ID, message, FIX, DOC.instrumentationExclusions);
  }
  const listed =
    parsed.prefixes.length === 0 ? "excludes nothing" : `excludes ${parsed.prefixes.join(", ")}`;
  return pass(
    ID,
    `${ENV_KEY} states the whole exclude list (the shipped default is replaced): it ${listed}`,
    DOC.instrumentationExclusions,
  );
};
