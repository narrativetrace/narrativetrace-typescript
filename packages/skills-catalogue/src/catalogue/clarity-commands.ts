// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Command literals for the clarity skill — the gate THIS runtime ships, spelled the way an ADOPTER
 * runs it in their own Vitest project.
 *
 * The runtime has no compiled classes to scan, so the gate is two published parts: the Vitest suite
 * reporter writes one results file for the whole run, and the `narrativetrace-clarity` bin gates
 * that file. The repository's own static scanner is a repository tool, not a published one, and
 * never appears here. Every verify is jq-free, like the rest of the catalogue.
 */

/** Repo-root-relative project the skill's snippets and replay run against: the SOLVED consumer. */
export const SOLVED_FIXTURE = "packages/skills-catalogue/evals/fixtures/clarity-consumer-solved";

/** Where the reporter writes the suite's results, relative to the project (the default output directory). */
export const RESULTS_PATH = "narrativetrace-output/clarity-results.json";

/** Prints the parts of the project's manifest the skill must preserve: scripts and dependencies. */
export const READ_SETUP =
  "node -e \"const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(JSON.stringify({scripts:p.scripts,dependencies:p.dependencies,devDependencies:p.devDependencies},null,2));\"";

/** Vitest is declared: the reporter this skill registers exists only for it. */
export const VITEST_DECLARED =
  "node -e \"const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); if(!{...p.dependencies,...p.devDependencies}.vitest) process.exit(1);\"";

/**
 * A Vitest config registers the suite reporter, imported from the `/reporters` subpath. Comments
 * are stripped first, so a registration that is only talked about in one does not count; a `//`
 * after a `:` is left alone, since that is a URL inside a string.
 */
export const REPORTER_REGISTERED =
  "node -e \"const fs=require('fs'); const f=['vitest.config.ts','vitest.config.mts','vitest.config.js','vitest.config.mjs'].find((n)=>fs.existsSync(n)); const s=f&&fs.readFileSync(f,'utf8').replace(/\\/\\*[\\s\\S]*?\\*\\//g,'').replace(/(^|[^:])\\/\\/[^\\n]*/g,(m,a)=>a); if(!s||!/new ClaritySuiteReporter\\(/.test(s)||!/@narrativetrace\\/vitest\\/reporters/.test(s)) process.exit(1);\"";

/**
 * Some test file under the project uses the Vitest fixture, which is what stamps a scenario for the
 * reporter. Vitest's default include runs `*.test.*` and `*.spec.*` alike, so both count.
 */
export const TEST_CAPTURES_CALLS =
  "node -e \"const fs=require('fs'),path=require('path'); function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap((e)=>e.name==='node_modules'?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);} if(!walk('.').some((f)=>/\\.(test|spec)\\.[cm]?[jt]sx?$/.test(f)&&/createNarrativeTest|narrativeTest/.test(fs.readFileSync(f,'utf8')))) process.exit(1);\"";

/**
 * The results file exists, is fresh (written within fifteen minutes), and carries at least one
 * scenario with a numeric score and an issues array. A run that traced nothing writes NO file, and
 * the gate skips a missing one, so freshness and non-emptiness are the only proof the gate had
 * something to gate.
 */
export const RESULTS_FRESH_AND_NONEMPTY = `node -e "const fs=require('fs'); const f='${RESULTS_PATH}'; const r=JSON.parse(fs.readFileSync(f,'utf8')); if(Date.now()-fs.statSync(f).mtimeMs>900000||!Array.isArray(r.scenarios)||r.scenarios.length===0||r.scenarios.some((s)=>typeof s.overallScore!=='number'||!Array.isArray(s.issues))) process.exit(1);"`;

/** Prints every scenario's scores and every issue with its element and the report's own suggestion. */
export const READ_RESULTS = `node -e "const r=JSON.parse(require('fs').readFileSync('${RESULTS_PATH}','utf8')); for(const s of r.scenarios){console.log(s.name+': overall '+s.overallScore+' (method '+s.methodNameScore+', parameter '+s.parameterNameScore+', class '+s.classNameScore+', structural '+s.structuralScore+', cohesion '+s.cohesionScore+')'); for(const i of s.issues) console.log('  '+i.severity+' '+i.category+' '+i.element+' - '+i.suggestion);}"`;

/**
 * The gate, with an EXAMPLE policy: the agent writes the thresholds the user asked for and keeps
 * any the project already has. `--output-dir` is load-bearing — its default is the working
 * directory, where a re-render would drop two files into the project root.
 */
export const CLARITY_GATE = `npx narrativetrace-clarity --input ${RESULTS_PATH} --output-dir narrativetrace-output --min-score 0.8 --max-high-issues 0`;

/** The suite, run once so the reporter writes the results the gate reads. */
export const RUN_SUITE = "npx vitest run";

/** A package script runs the gate, so CI has one name to call. */
export const GATE_SCRIPT_PRESENT =
  "node -e \"const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); if(!/narrativetrace-clarity(\\s|$)/.test(p.scripts?.clarity??'')) process.exit(1);\"";
