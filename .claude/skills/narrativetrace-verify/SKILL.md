---
name: narrativetrace-verify
description: "Verifies a change in a TypeScript project by reading what the code actually did before saying it is done. Use after the tests are green and before reporting a change that crosses collaborators, branches, retries, runs async, carries state between calls, or touches code not written in this session — and skip it, saying why, for a pure function or a one-class edit. Writes the intent down first, runs the smallest real path with NarrativeTrace on, reads the value-free structural trace against the intent, opens values only on the span that looks wrong, fixes and re-reads, then pins the flow as an approval baseline behind your yes and reports what the trace showed, citing span ids. Say 'verify this change with the trace', 'check what the code actually did', 'did the flow do what I meant', or 'pin this flow as a baseline' to invoke it."
when_to_use: "Non-obvious triggers: the suite is green but the change touched more call sites than it added; a notification, payment or retry path changed; a .received.nt appeared after a test run; you are about to write 'tests pass' as the whole report."
---

# narrativetrace-verify

## 1. Decide whether to trace, and say so

**Flagged:** judgmental — before anything runs, the reply says which it is: 'tracing: <the reason>' when the change crosses two or more collaborators over a boundary, branches, retries, runs async or concurrently, carries state between calls, touched more call sites than it added, or includes code not written in this session; or 'skipping narrativetrace-verify: <a pure function | a one-class edit with no collaborator | a flow one test already walks end to end>' — a skip ends the skill here, and that sentence is the report. A whole flow's .nt is dozens of lines: cheap where the path is not obvious, waste where it is

## 2. Write the intent down before running anything

**Flagged:** judgmental — three to six lines in the reply, under the word Intent, written before the first traced run: which collaborators the change touches, in which order, under which branch, how many times — the oracle the trace is read against, never edited after the run

## 3. Run the smallest real path with tracing on

**when:** the project already has a test that drives the changed path through its real collaborators, run that one — again, if it already ran: a trace from a run made before the Intent was written does not count; otherwise write the smallest one, as below

<!-- snippet: examples/sixty-seconds/__tests__/place-order-flow.test.ts -->
```ts
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";

// The smallest test that drives the real path: the collaborators the change touched, wired as
// production wires them, each wrapped with the test's narrativeContext. After the test, the fixture
// writes the shape to narrativetrace-output/structural/<module>/<scenario>.nt and the values to
// narrativetrace-output/<module>/<scenario>.md.
const test = createNarrativeTest();

class Inventory {
  reserve(productId: string, quantity: number): boolean {
    return quantity > 0 && productId !== "";
  }
}

class OrderService {
  constructor(private readonly inventory: Inventory) {}

  placeOrder(customerId: string, productId: string, quantity: number): string {
    if (!this.inventory.reserve(productId, quantity)) throw new RangeError("not in stock");
    return `ORD-${customerId}-${productId}-${quantity}`;
  }
}

test("customer places an order", ({ narrativeContext }) => {
  const inventory = traceObject(new Inventory(), narrativeContext, {
    reserve: ["productId", "quantity"],
  });
  const orders = traceObject(new OrderService(inventory), narrativeContext, {
    placeOrder: ["customerId", "productId", "quantity"],
  });

  expect(orders.placeOrder("C-1234", "SKU-KB", 2)).toBe("ORD-C-1234-SKU-KB-2");
});
```
<!-- /snippet -->

**verify:** `npx vitest run <the smallest test that drives the real path>`

**failure:** no .nt for the test appears under narrativetrace-output/structural — the test is not built with createNarrativeTest, or the collaborators on the path are not wrapped with traceObject and the test's narrativeContext. Fix: run narrativetrace-doctor and apply its fix, then run the test again

## 4. Read the structural trace first, against the intent

**Flagged:** judgmental — the .nt of the test just run was opened and read whole before any value was looked at, and the reply walks it against the intent — calls, order, branch, multiplicity — naming every match and every mismatch by its span id (#2.1); the shapes below are the checklist

```bash
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output/structural').filter(f=>f.endsWith('.nt')).sort()){console.log(f);}"
```

## 5. Open values on the span that looks wrong, and only there

**Flagged:** judgmental — only the flagged span was read in the .md narrative, found by the id the .nt gave it — not the whole file; a [REDACTED] value stays redacted

**when:** only when the structural read named a span that does not match the intent; otherwise go on to the pin

```bash
node -e "const fs=require('fs'),path=require('path');const skip=['structural','feedback'];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output').filter(f=>f.endsWith('.md')).sort()){console.log(f);}"
```

## 6. Fix, re-run, read again

**Flagged:** judgmental — the same test ran again after the fix and its new .nt was read whole: the span that was wrong now matches the intent, and a fix that changed the shape was read again from the structural read

**when:** only when the structural read named a span that does not match the intent; otherwise go on to the pin

```bash
npx vitest run <the smallest test that drives the real path>
```

## 7. Turn approval mode on

**Flagged:** judgmental — the traced tests run with approval mode on (the option above, or NARRATIVETRACE_APPROVAL=true in the package.json test script), and .gitignore carries the line narratives/**/*.received.nt so a review copy is never committed

**when:** if approval mode is off — no createNarrativeTest({ approval: true }), no NARRATIVETRACE_APPROVAL=true in the test run, or the doctor's config.approval-mode finding fails; when it is already on, go straight to the run

```ts
// the test file, or the shared helper your traced tests use
const test = createNarrativeTest({ approval: true });
```

**failure:** npx narrativetrace-approve is not found — @narrativetrace/vitest is not installed in this project, so neither the option nor the approve command exists. Fix: install @narrativetrace/vitest as a dev dependency with the project's package manager and run again

## 8. Run the suite in approval mode and show every .received.nt

**Flagged:** judgmental — approval mode compares every traced test, not only the one this skill ran, so the run that writes the review copies is the whole suite; the first run of a test with no baseline fails on purpose — that failure is what writes its review copy — and the whole text of each .received.nt that run wrote is in the reply, not a summary of it — it holds names and shape and no value, which is why it is safe to commit once approved; where a .approved.nt already existed, the reply also names what the delta changed, by span id, in the program's own words, and whether it was meant

```bash
npx vitest run
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narratives').filter(f=>f.endsWith('.received.nt')).sort()){console.log(f);console.log(fs.readFileSync(f,'utf8'));}"
```

## 9. Ask once whether to pin it, then stop the turn

**Flagged:** judgmental — the reply ends with the question and nothing after it; the answer is the user's next message, never something assumed in this one. Do not run npx narrativetrace-approve before the user says yes — promoting is the pinning. And everything else — the report, every caveat, what approving means — goes before the question; the question is the reply's last line, with no sentence after it: write the explanation first, then ask. The final line is the question alone, such as 'Pin this flow as the baseline?' — nothing after its question mark: not what happens after a yes, not the command it would run, not a parenthetical, a note or an offer.

## 10. Promote what was shown, and nothing else

**Flagged:** judgmental — each .approved.nt now holds exactly the text that was shown and no .received.nt is left beside it — git status --short narratives lists the new or changed .approved.nt files and nothing else; those are what get committed — and npx vitest run passes: the suite is green again after the promotion

```bash
npx narrativetrace-approve
```

## 11. Report what the trace showed

**Flagged:** judgmental — two sentences on what the trace showed, every claim citing the span id it rests on — a claim without an id is not a claim, and only ids in the .nt that was read count — with the .nt attached or quoted; 'tests pass' alone is not the report

## Which flavour answers which question

| flavour | where | carries | answers |
|---|---|---|---|
| structural `.nt` | `narrativetrace-output/structural/<test file>/<scenario>.nt` | shape only: calls, order, nesting, parameter names, multiplicity, span ids — dozens of lines for a whole flow | did the flow do what I meant? |
| Markdown narrative | `narrativetrace-output/<test file>/<scenario>.md` | values (redacted), outcomes, durations | what value crossed this boundary? — read one span, by id |
| indented text | `renderIndentedText`, a failing test's console output | the same values as plain text | the same question, in a console or a failure message |
| sequence diagram | `narrativetrace-output/diagrams/<test file>/<scenario>.mmd` | who called whom, in order, across async work | ordering across components and concurrent tasks |
| approval delta | the failing test's message: `.received.nt` against `.approved.nt` | what changed in the shape, citing both sides' ids | is this change intended? |
| prose | `renderProse` | narration for a person | explaining the flow to the user — never read it to check the code |

Use the cheapest flavour that answers the question, and look at values only where the
shape says to look. A span id (`#1`, `#1.3`, `#1.3.2`) is the span's position in the tree
and the same in every flavour: find in the `.md` the span the `.nt` flagged by its id.
Redaction stays on — the deny-list and `[REDACTED]` are never turned off to see more; a
redacted value that matters is reasoned about by its parameter name and the shape around
it.

## Shapes that mean something went wrong

- a call made twice that the intent makes once
- a call before its precondition — a notification before the payment that it announces
- a branch never taken that the intent takes
- a retry that masks a failure
- a side effect inside a loop
- a swallowed exception: a thrown outcome `!!` under a call that returned normally
- a cleanup that never ran
- a value crossing a boundary that should have been redacted

## Always

- Cite a span id for every claim about the trace (an id points at one span in every flavour, so a reviewer can check the claim; a claim without one cannot be checked)
- Use the cheapest flavour that answers the question (the structural trace first and a value on one span only is what keeps the common case near zero tokens)
- Show the whole .received.nt before asking anything (the baseline becomes the contract every later change is held to, and a person can only approve what they have actually read)

## Never

- Never report a change as done on green tests alone once this skill decided to trace (the suite checks what someone thought to assert; the trace shows what the code did)
- Never read a trace against nothing (an intent written after the run bends to whatever happened — that is why it comes first)
- Never turn redaction off to see more (a redacted value that matters is reasoned about by its name and shape; turning redaction off puts the user's secrets in the transcript)
- Never promote a baseline in the turn that asked (approval is the user's next message — a yes assumed in the same turn is not one)
- Never edit the .received.nt after showing it (what was approved has to be what is promoted, so a changed run is rendered again and shown again)
- Never commit a .received.nt (it is the review copy; the committed contract is the .approved.nt)
