---
name: add-narrativetrace-clarity
description: "Adds or verifies NarrativeTrace Clarity in a TypeScript Vitest project. Use when you want a first naming report, per-element explanations, renames for unclear names, or an explicit clarity quality gate. Registers the clarity reporter in the Vitest config, runs the suite, checks the fresh nonempty results file, reads the scores and issues, applies the report's rename suggestions and re-runs until the gate is clean, and preserves existing thresholds. Repairs a missing or empty results file by making a test capture a traced call; route tracing itself being broken to narrativetrace-doctor. Say 'add a clarity report', 'explain our clarity scores', 'set up a clarity quality gate', 'why is the clarity report empty', or 'which names make the trace hard to read' to invoke it."
when_to_use: "A project has NarrativeTrace and Vitest, and needs a first clarity report, a score explanation, renames, or optional build enforcement."
allowed-tools: Bash(pnpm *), Bash(npx *), Bash(node *), Bash(git *)
---

# add-narrativetrace-clarity

## 1. Read the existing test setup before changing it

```bash
node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(JSON.stringify({scripts:p.scripts,dependencies:p.dependencies,devDependencies:p.devDependencies},null,2));"
git status --short
```

**verify:** `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); if(!{...p.dependencies,...p.devDependencies}.vitest) process.exit(1);"`

**failure:** the verify exits 1: vitest is declared in neither dependencies nor devDependencies — the reporter and the results file this skill gates on exist only for Vitest; no other test runner writes them. Fix: stop and tell the user: do not migrate their test runner to get a report; the project can still call analyzeClarity on a captured trace by hand

## 2. Register the clarity reporter in the Vitest config

<!-- snippet: packages/skills-catalogue/evals/fixtures/clarity-consumer-solved/vitest.config.js -->
```js
import { ClaritySuiteReporter } from "@narrativetrace/vitest/reporters";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: ["default", new ClaritySuiteReporter()],
  },
});
```
<!-- /snippet -->

**verify:** `node -e "const fs=require('fs'); const f=['vitest.config.ts','vitest.config.mts','vitest.config.js','vitest.config.mjs'].find((n)=>fs.existsSync(n)); const s=f&&fs.readFileSync(f,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:])\/\/[^\n]*/g,(m,a)=>a); if(!s||!/new ClaritySuiteReporter\(/.test(s)||!/@narrativetrace\/vitest\/reporters/.test(s)) process.exit(1);"`

**failure:** Vitest fails with: Vitest failed to access its internal state — the reporter was imported from the package root, which also loads vitest itself inside a config file that runs before the test runtime exists. Fix: import ClaritySuiteReporter from @narrativetrace/vitest/reporters, the subpath that never loads vitest

**failure:** the config fails with: Cannot find package '@narrativetrace/vitest' — the packages are not installed in this project. Fix: add @narrativetrace/vitest and @narrativetrace/clarity as dev dependencies with the project's own package manager, then re-run

**failure:** the project's config already sets reporters — the project chose its own reporters and this skill must not replace them. Fix: append new ClaritySuiteReporter() to the existing reporters array, keeping every entry already there

## 3. Make sure a test captures a traced call

<!-- snippet: packages/skills-catalogue/evals/fixtures/clarity-consumer-solved/test/order-placer.test.js -->
```js
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { OrderPlacer } from "../src/order-placer.js";

const test = createNarrativeTest();

test("a customer places an order", ({ narrativeContext }) => {
  const placer = traceObject(new OrderPlacer(), narrativeContext, {
    placeOrder: ["customerId", "sku", "quantity"],
  });

  expect(placer.placeOrder("C-1", "SKU-7", 2)).toBe("ORD-C-1-SKU-7-2");
});
```
<!-- /snippet -->

**verify:** `node -e "const fs=require('fs'),path=require('path'); function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap((e)=>e.name==='node_modules'?[]:e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);} if(!walk('.').some((f)=>/\.(test|spec)\.[cm]?[jt]sx?$/.test(f)&&/createNarrativeTest|narrativeTest/.test(fs.readFileSync(f,'utf8')))) process.exit(1);"`

**failure:** the verify exits 1: no test file uses createNarrativeTest — the reporter aggregates the scenarios the fixture records; a suite that traces nothing records none, and writes no results file. Fix: adapt this example to an existing service: create the test with createNarrativeTest, wrap the service with traceObject on the test's narrativeContext, and make a call

## 4. Run the suite so the reporter writes the results

```bash
npx vitest run
```

**verify:** `node -e "const fs=require('fs'); const f='narrativetrace-output/clarity-results.json'; const r=JSON.parse(fs.readFileSync(f,'utf8')); if(Date.now()-fs.statSync(f).mtimeMs>900000||!Array.isArray(r.scenarios)||r.scenarios.length===0||r.scenarios.some((s)=>typeof s.overallScore!=='number'||!Array.isArray(s.issues))) process.exit(1);"`

**failure:** the suite passes but narrativetrace-output/clarity-results.json is missing or has no scenarios — no test recorded a traced call, or output was turned off, or the reporter writes to another directory. Fix: check that a test captures a call (previous step), remove an explicit NARRATIVETRACE_OUTPUT=false, and adapt every path to the reporter's configured output directory

## 5. Read the scores and the issues

```bash
node -e "const r=JSON.parse(require('fs').readFileSync('narrativetrace-output/clarity-results.json','utf8')); for(const s of r.scenarios){console.log(s.name+': overall '+s.overallScore+' (method '+s.methodNameScore+', parameter '+s.parameterNameScore+', class '+s.classNameScore+', structural '+s.structuralScore+', cohesion '+s.cohesionScore+')'); for(const i of s.issues) console.log('  '+i.severity+' '+i.category+' '+i.element+' - '+i.suggestion);}"
```

**verify:** `node -e "const fs=require('fs'); const f='narrativetrace-output/clarity-results.json'; const r=JSON.parse(fs.readFileSync(f,'utf8')); if(Date.now()-fs.statSync(f).mtimeMs>900000||!Array.isArray(r.scenarios)||r.scenarios.length===0||r.scenarios.some((s)=>typeof s.overallScore!=='number'||!Array.isArray(s.issues))) process.exit(1);"`

## 6. Explain the scores, notes and what they do not show

**Flagged:** judgmental — base the explanation on the scores and issues just read: a short table of element, observed score and the report's exact suggestion, with your own rename advice labelled separately as a suggestion. overallScore (0-1) weights method names 30%, parameter names 25%, class names 20%, structural quality 15% and cohesion 10%. structuralScore reflects parameter count and call depth. An empty issues array means no scoring rule flagged anything; it does not prove every name is unambiguous

## 7. Wire the gate into the package scripts, only when asked

<!-- snippet: packages/skills-catalogue/evals/fixtures/clarity-consumer-solved/package.json -->
```json
{
  "name": "orders-service",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "clarity": "narrativetrace-clarity --input narrativetrace-output/clarity-results.json --output-dir narrativetrace-output --min-score 0.8 --max-high-issues 0"
  },
  "devDependencies": {
    "@narrativetrace/clarity": "latest",
    "@narrativetrace/cli": "latest",
    "@narrativetrace/core-node": "latest",
    "@narrativetrace/proxy": "latest",
    "@narrativetrace/vitest": "latest",
    "vitest": "^3.2.0"
  }
}
```
<!-- /snippet -->

**verify:** `node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8')); if(!/narrativetrace-clarity(\s|$)/.test(p.scripts?.clarity??'')) process.exit(1);"`

**failure:** the gate runs but never fails, whatever the names are — --warn-only makes every violation advisory, and a threshold below every observed score cannot fail; neither proves enforcement. Fix: write the thresholds the user asked for, keep the ones the project already has, and prove it once: set a threshold above an observed score, confirm the gate fails naming it, restore the policy and re-run

## 8. Rename by the report's suggestions, then re-run until the gate is clean

```bash
npx vitest run
npx narrativetrace-clarity --input narrativetrace-output/clarity-results.json --output-dir narrativetrace-output --min-score 0.8 --max-high-issues 0
```

**verify:** `npx narrativetrace-clarity --input narrativetrace-output/clarity-results.json --output-dir narrativetrace-output --min-score 0.8 --max-high-issues 0`

**failure:** the gate exits 1 naming a scenario below the minimum score — the report's issues name the elements that cost the score; the suite has to be run again for any rename to be measured. Fix: rename the flagged element everywhere it is used, including the tests, keep the behaviour unchanged, run the suite and the gate again, and repeat until the gate passes

**failure:** the bin exits 1 saying the input file cannot be read — the suite has not run since the output directory was cleaned. Fix: run the suite first; the gate reads the results the reporter wrote

## 9. Hand missing tracing or output to the doctor

```bash
npx @narrativetrace/cli doctor || true
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==25) process.exit(1);"`

**failure:** the results file stays missing after a test captures a call — tracing or output is not wired the way the reporter expects. Fix: run narrativetrace-doctor for the diagnosis, apply the identified configuration fix when the user asked for setup or repair, and repeat the run; do not stop at merely naming the doctor

## Always

- Start from a fresh suite run and read the results file it wrote. (a passing suite can still leave a stale or empty report, so the file's freshness is the only proof the gate had something to gate)
- Preserve the project's existing reporters, thresholds and output directory. (they are the project's own choices; this skill adds a reporter beside them and adapts its paths to the configured output directory)
- Use the thresholds the user asked for; the numbers in the gate command are an example. (a threshold is the project's own policy, and an invented one either blocks work nobody asked to block or passes everything)
- Measure every rename with another run. (a score is observed, never predicted: only the suite run after the rename shows what it did to the gate)

## Never

- Never lower or replace an existing threshold to hide a failure. (enforcement is an explicit project choice, and a failing gate is the useful evidence the rename step exists to act on)
- Never describe a report as enforcement, or promise a score for an untested rename. (a report only informs; the gate enforces, and a rename's effect is measured by the next run, not guessed)
- Never harvest a glossary merely to read existing vocabulary. (clarity reads a committed glossary file on its own, and harvesting is a separate opt-in write outside this skill)
- Never call a missing results file successful. (the gate skips when the file is absent, so a green exit with no file proves nothing)
- Never import the reporter from the package root in a Vitest config. (the root also loads vitest itself, which throws inside a config file on every Vitest version; the reporters subpath does not)
