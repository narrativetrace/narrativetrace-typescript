// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * `node -e` snippets shared between `narrativetrace-doctor` and `add-narrative-tracing` — both
 * skills call the same doctor CLI, so the literal command text lives here once rather than twice
 * (the duplication ratchet catches a second hand-copied literal same as it catches a hand-copied
 * doc block). jq-free by design: the closed command vocabulary is pnpm/npx/node/git, no `jq`.
 */

/**
 * Runs `narrativetrace doctor` and asserts the report is well-formed (parses, carries one finding
 * per check the doctor's registry runs) — the mechanical floor a step can claim just from "doctor
 * ran". The count is typed, not imported: this catalogue sits BELOW the tooling layer (the
 * architecture test), so `add-narrative-tracing.test.ts` holds it to `DOCTOR_CHECKS.length`
 * instead, and a check added to the doctor fails there until this moves with it. It does NOT assert
 * any finding's pass/fail *value*: those are already unit-tested per-check at the CLI layer, and a
 * project's report legitimately fails some checks while still being well-formed — that is doctor
 * working correctly, not a defect in whatever step is running this.
 */
/** How many checks the doctor runs: twelve hand-written plus one per framework-table row. */
export const DOCTOR_CHECK_COUNT = 25;

export const DOCTOR_REPORT_WELL_FORMED = `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==${DOCTOR_CHECK_COUNT}) process.exit(1);"`;

/** Runs the doctor for its report, whatever it finds — a failing finding is the step's input. */
export const RUN_DOCTOR = "npx @narrativetrace/cli doctor || true";

/**
 * Every framework finding holds — the framework step's own claim. Selects them by the report's
 * `framework` field, never by a list of check ids: which frameworks exist is the INSTALLED doctor's
 * answer (its own framework table), so this command cannot go stale when a release adds a row. A
 * framework reported as having no integration shipped always passes, so it never blocks the step.
 */
export const FRAMEWORK_FINDINGS_HOLD =
  "npx @narrativetrace/cli doctor --json | node -e \"const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const bad=r.findings.filter(f=>f.framework&&f.status!=='pass'); if(bad.length>0){console.error(JSON.stringify(bad)); process.exit(1);}\"";

/**
 * The framework step's hand-off, word for word across the runtimes (Phase 6 cross-port item 5).
 * Names no framework on purpose.
 */
export const APPLY_FRAMEWORK_FIXES =
  "run the doctor; apply every config.<framework>-* fix it prints, in order, as printed, then run the doctor again; a framework it reports as having no integration shipped is left alone";

/**
 * Every `toolchain.*` finding holds (status `pass`) — the install step's own claim, not a repeat of
 * the install command itself.
 */
export const TOOLCHAIN_CHECKS_HOLD =
  "npx @narrativetrace/cli doctor --json | node -e \"const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const bad=r.findings.filter(f=>f.id.startsWith('toolchain.')&&f.status!=='pass'); if(bad.length>0){console.error(JSON.stringify(bad)); process.exit(1);}\"";

/**
 * The `trap.redaction-proof` finding is present and well-formed — the redaction step's own claim.
 * Deliberately does NOT assert `status==='pass'`: a project with no redaction test yet legitimately
 * reports `fail` here, and this step's job is proving the *check itself* ran, not asserting the
 * outcome a still-unwritten test would produce.
 */
export const REDACTION_PROOF_FINDING_PRESENT =
  "npx @narrativetrace/cli doctor --json | node -e \"const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const f=r.findings.find(x=>x.id==='trap.redaction-proof'); if(!f||(f.status!=='pass'&&f.status!=='fail')) process.exit(1);\"";

/**
 * `narrativetrace init --dry-run` produced a plan with at least one action, and exited 0 (a clean
 * preview, no refusal). "Never the applying form" is NOT re-checked against the filesystem here —
 * `--dry-run` never calls the plan executor at all (`cli.ts`'s own branch: apply only when
 * `!options.dryRun`), so a dry run cannot write regardless of what already exists on disk; a
 * `.agents/skills`-exists check would produce a false failure on a project that already has one
 * from an earlier, real install. The Tier A2 replay this step runs under (`replay.test.ts`) already
 * proves "touched nothing" at the whole-repository level: `tools/tree-writes-guard.mjs` fails the
 * gate the moment ANY wrapped test adds so much as one file to `git status --porcelain`.
 */
export const INIT_PREVIEW_PRODUCED_A_DIFF =
  "npx @narrativetrace/cli init --dry-run --json | node -e \"const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.actions)||r.actions.length===0||r.exitCode!==0) process.exit(1);\"";

/** Echoes the "write the test" guidance the redaction step asks for — a no-op, always-succeeds command. */
export const REDACTION_TEST_GUIDANCE =
  "node -e \"console.log('Render a call with a deny-listed parameter name (e.g. password or token) in a test and assert the output contains [REDACTED], and that a neighboring non-sensitive value is still present.')\"";

/**
 * Opens the newest rendered Markdown trace under the output directory — never a fixture path, so
 * the same command works whatever a real project scenario is named. The `feedback` subdirectory is
 * skipped: it holds the problem report's own Markdown files, which are newer than any trace the
 * moment a report is drafted and are not traces.
 */
export const OPEN_NEWEST_RENDERED_TRACE =
  "node -e \"const fs=require('fs'),path=require('path');function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p];});}const files=walk('narrativetrace-output').filter(f=>f.endsWith('.md')&&!f.split(path.sep).includes('feedback'));if(!files.length){console.error('no rendered .md file found under narrativetrace-output');process.exit(1);}const newest=files.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];console.log(newest);console.log(fs.readFileSync(newest,'utf8'));\"";

/**
 * If a `.received.nt` sits beside an `.approved.nt`, diffs them; otherwise shows the newest
 * structural trace under the output directory as nothing-pending context. Never a fixture path.
 */
export const APPROVAL_FLOW_DIFF =
  "node -e \"const fs=require('fs'),path=require('path');function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?walk(p):[p];});}const dir='narrativetrace-output';const received=walk(dir).filter(f=>f.endsWith('.received.nt'));if(received.length){const newest=received.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];const approved=newest.slice(0,-'.received.nt'.length)+'.approved.nt';console.log('received: '+newest);if(fs.existsSync(approved)){console.log('approved: '+approved);console.log(fs.readFileSync(approved,'utf8'));console.log('--- vs received ---');console.log(fs.readFileSync(newest,'utf8'));}else{console.log('no .approved.nt yet - first approval, review then promote');console.log(fs.readFileSync(newest,'utf8'));}}else{const nt=walk(dir).filter(f=>f.endsWith('.nt'));if(!nt.length){console.error('no structural .nt file found under narrativetrace-output');process.exit(1);}const newest=nt.map(f=>[f,fs.statSync(f).mtimeMs]).sort((a,b)=>b[1]-a[1])[0][0];console.log('no .received.nt pending; newest structural trace: '+newest);console.log(fs.readFileSync(newest,'utf8'));}\"";
