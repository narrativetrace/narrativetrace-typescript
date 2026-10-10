// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The commands of `narrativetrace-verify` and `narrativetrace-debug`, in the closed TypeScript
 * vocabulary — each one what an ADOPTER runs in their own project. Port of Java `VerifyCommands`.
 *
 * Tier A2 replays every one against `examples/sixty-seconds`, the placeholder filled with that
 * fixture's flow test. The listing commands print paths (and, for a review copy, its text) and
 * exit 0 when there is nothing to list: an empty list is an answer, not a failure.
 */

/** The fixture's output directory and the approved-trace directory, both this runtime's defaults. */
const OUTPUT = "narrativetrace-output";
const APPROVED = "narratives";

/** The placeholder an agent replaces with the one test that drives the changed path. */
export const THE_PATH = "<the smallest test that drives the real path>";

/** Runs the one test that drives the changed path; the vitest fixture traces it. */
export const RUN_THE_PATH = `npx vitest run ${THE_PATH}`;

/** Runs the whole suite — what approval mode compares, every traced test at once. */
export const RUN_THE_SUITE = "npx vitest run";

/**
 * A `node -e` one-liner listing every file under `dir` ending in `suffix`, skipping `skip`
 * directories; with `print`, each file's text follows its path.
 */
function listUnder(dir: string, suffix: string, skip: readonly string[], print: boolean): string {
  const show = print ? "console.log(f);console.log(fs.readFileSync(f,'utf8'));" : "console.log(f);";
  return `node -e "const fs=require('fs'),path=require('path');const skip=${JSON.stringify(skip).replaceAll('"', "'")};function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('${dir}').filter(f=>f.endsWith('${suffix}')).sort()){${show}}"`;
}

/** Lists the value-free structural traces the run wrote. */
export const FIND_STRUCTURAL = listUnder(`${OUTPUT}/structural`, ".nt", [], false);

/** Lists the value-bearing Markdown narratives the run wrote (not the feedback verb's drafts). */
export const FIND_NARRATIVES = listUnder(OUTPUT, ".md", ["structural", "feedback"], false);

/** Lists the sequence diagrams the run wrote — who called whom, in order, across async work. */
export const FIND_DIAGRAMS = listUnder(`${OUTPUT}/diagrams`, ".mmd", [], false);

/** Prints every review copy an approval-mode run wrote beside its baseline, path then text. */
export const SHOW_RECEIVED = listUnder(APPROVED, ".received.nt", [], true);

/** Promotes every reviewed `.received.nt` to its `.approved.nt` baseline. */
export const APPROVE = "npx narrativetrace-approve";

/** The placeholder an agent replaces with the test that reproduces the reported symptom. */
export const THE_REPRODUCTION = "<the test that reproduces the symptom>";

/** Runs the reproducing test — red until the fix, its `.md` and diagram written either way. */
export const REPRODUCE = `npx vitest run ${THE_REPRODUCTION}`;
