---
name: narrativetrace-debug
description: "Finds the cause of a wrong result in a TypeScript project by reading what the code did with the values, not by stepping through it. Use when a symptom is reported — a wrong amount, a wrong id, a call in the wrong order, a test that fails with a value nobody expected. Reproduces it with the smallest input and NarrativeTrace on, finds the first span where a value diverges and names it by its span id (the sequence diagram first when async work is involved), narrows to that span's sub-tree, fixes it there and checks the structural trace shows nothing else moved, pins the reproduction as a regression test and an approval baseline behind your yes, and reports the root cause by span id. Hands a defect in NarrativeTrace itself to narrativetrace-feedback. Say 'debug this with the trace', 'find where this value goes wrong', or 'why is this result wrong' to invoke it."
---

# narrativetrace-debug

## 1. Reproduce the symptom with tracing on

**when:** a test already drives the path with the input from the symptom, run that one; otherwise write the smallest one, as below — the reported input, through the real collaborators each wrapped with traceObject and the test's narrativeContext, asserting the value the symptom says should have come out

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

**verify:** `npx vitest run <the test that reproduces the symptom>`

**failure:** no .md for the test appears under narrativetrace-output — the test is not built with createNarrativeTest, or the collaborators on the path are not wrapped with traceObject and the test's narrativeContext. Fix: run narrativetrace-doctor and apply its fix, then run the test again

## 2. Find the symptom in the values

**Flagged:** judgmental — the reported value is in this run's .md narrative, or the reproducing test fails on it — a symptom that does not reproduce is said so, and the loop stops here

```bash
node -e "const fs=require('fs'),path=require('path');const skip=['structural','feedback'];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output').filter(f=>f.endsWith('.md')).sort()){console.log(f);}"
```

## 3. Across async work, read the sequence diagram first

**Flagged:** judgmental — the reproduction's .mmd was read before any span's values, and the reply says which call ran before which, by the span id in each call's note — the span it points to is the one localized next

**when:** only when the path crosses async work — the .nt shows a fork, async or fire-and-forget marker — or the symptom is about order (a call that ran before or after another); otherwise go straight to localizing

```bash
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output/diagrams').filter(f=>f.endsWith('.mmd')).sort()){console.log(f);}"
```

## 4. Localize by reading: name the first span where a value diverges

**Flagged:** judgmental — the reproduction's .md spans were read from the root down until the first one whose inputs are what the symptom implies but whose result, the value it passes on, or the branch it takes is not; the reply names that span by its id (#1.3) and the boundary — the collaborator, the parameter or return, the value that arrived and the value that left — before any code is changed: by reading, not by stepping through a debugger or adding console.log

## 5. Bisect by span, not by file

**Flagged:** judgmental — only the sub-tree under the diverging id was read on each re-run — the spans whose id begins with it (#1.3, #1.3.1, #1.3.2) — and where the work inside that span is not traced, the collaborator it calls was wrapped with traceObject in the reproducing test, as the listing above wraps its collaborators, and the run repeated, until the divergence sits in the smallest span that has it; never @notTraced to narrow — in this runtime it redacts a parameter, it does not scope a trace

**when:** only when the value went into the diverging span right and came out wrong, and what happens in between is more than that span's own few lines; otherwise the diverging span is the defect — go on to the fix

```bash
npx vitest run <the test that reproduces the symptom>
```

## 6. Hand a defect in NarrativeTrace itself to narrativetrace-feedback

**Flagged:** judgmental — narrativetrace-feedback was started with the span id and the value-free .nt — never a value from the trace — and the project's code was not changed to work around it; the loop ends with that hand-off

**when:** only when the trace and the code disagree — a call the code makes has no span, a span shows a value the code did not pass, one span has two ids in two flavours — or the diverging span is inside NarrativeTrace; otherwise go on to the fix

## 7. Fix it in the diverging span, re-run the same input, read the same span

**Flagged:** judgmental — the change is in the code of that span — the method the diverging id names, or what it calls — and the reproducing test passes; the same span, by the same id, now carries the value the symptom implied; a change anywhere else that makes the test pass silences the symptom and leaves the defect, so it is undone

```bash
npx vitest run <the test that reproduces the symptom>
```

## 8. Check that nothing else moved

**Flagged:** judgmental — the fixed run's .nt was read whole and compared, line by line, with the call lines of the reproduction's .md — a red run writes no .nt (the .nt on disk is the last green one), so the shape before the fix is the .md's calls and ids without their values: the same calls in the same order under the same ids; a value fix moves no line of a value-free trace, and every line that did move is named by its id in the reply and either explained by the fix or undone

```bash
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narrativetrace-output/structural').filter(f=>f.endsWith('.nt')).sort()){console.log(f);}"
```

## 9. Keep the reproduction as the regression test

**Flagged:** judgmental — the reproducing test stays in the suite with the input from the symptom and asserts the value the fixed span now carries — not only that nothing throws — so it fails when the fix is undone; its structural trace is what the pin below makes the baseline

## 10. Turn approval mode on

**Flagged:** judgmental — the traced tests run with approval mode on (the option above, or NARRATIVETRACE_APPROVAL=true in the package.json test script), and .gitignore carries the line narratives/**/*.received.nt so a review copy is never committed

**when:** if approval mode is off — no createNarrativeTest({ approval: true }), no NARRATIVETRACE_APPROVAL=true in the test run, or the doctor's config.approval-mode finding fails; when it is already on, go straight to the run

```ts
// the test file, or the shared helper your traced tests use
const test = createNarrativeTest({ approval: true });
```

**failure:** npx narrativetrace-approve is not found — @narrativetrace/vitest is not installed in this project, so neither the option nor the approve command exists. Fix: install @narrativetrace/vitest as a dev dependency with the project's package manager and run again

## 11. Run the suite in approval mode and show every .received.nt

**Flagged:** judgmental — approval mode compares every traced test, not only the one this skill ran, so the run that writes the review copies is the whole suite; the first run of a test with no baseline fails on purpose — that failure is what writes its review copy — and the whole text of each .received.nt that run wrote is in the reply, not a summary of it — it holds names and shape and no value, which is why it is safe to commit once approved; where a .approved.nt already existed, the reply also names what the delta changed, by span id, in the program's own words, and whether it was meant

```bash
npx vitest run
node -e "const fs=require('fs'),path=require('path');const skip=[];function walk(d){if(!fs.existsSync(d))return[];return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);return e.isDirectory()?(skip.includes(e.name)?[]:walk(p)):[p];});}for(const f of walk('narratives').filter(f=>f.endsWith('.received.nt')).sort()){console.log(f);console.log(fs.readFileSync(f,'utf8'));}"
```

## 12. Ask once whether to pin it, then stop the turn

**Flagged:** judgmental — the reply ends with the question and nothing after it; the answer is the user's next message, never something assumed in this one. Do not run npx narrativetrace-approve before the user says yes — promoting is the pinning. And everything else — the report, every caveat, what approving means — goes before the question; the question is the reply's last line, with no sentence after it: write the explanation first, then ask. The final line is the question alone, such as 'Pin this flow as the baseline?' — nothing after its question mark: not what happens after a yes, not the command it would run, not a parenthetical, a note or an offer.

## 13. Promote what was shown, and nothing else

**Flagged:** judgmental — each .approved.nt now holds exactly the text that was shown and no .received.nt is left beside it — git status --short narratives lists the new or changed .approved.nt files and nothing else; those are what get committed — and npx vitest run passes: the suite is green again after the promotion

```bash
npx narrativetrace-approve
```

## 14. Report the root cause as the trace showed it

**Flagged:** judgmental — the root cause in the user's own terms — the span id where it diverged, the value that arrived and the value that left, the branch it took — and what the fix changed in that span; every claim cites the span id it rests on, from the .nt or .md read in this session: a claim without an id is not a claim. The report is written in full before the pin question, where the gate puts it, and the closing reply after the promotion names the span id again in its one-line summary of the cause

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
- Narrow to one span before reading its values (debugging is where values pay for themselves, but only on the span that diverged — a whole trace of values buries the one that matters)
- Show the whole .received.nt before asking anything (the baseline becomes the contract every later change is held to, and a person can only approve what they have actually read)

## Never

- Never change code before the diverging span is named (a fix made before the trace says where the value went wrong is a guess, and a guess that turns the test green hides the defect it missed)
- Never make the symptom go away somewhere other than the diverging span (a correction downstream, a caught exception or a changed expectation silences the symptom and leaves the defect for the next caller of that span)
- Never turn redaction off to see more (a redacted value that matters is reasoned about by its name and shape; turning redaction off puts the user's secrets in the transcript)
- Never promote a baseline in the turn that asked (approval is the user's next message — a yes assumed in the same turn is not one)
- Never edit the .received.nt after showing it (what was approved has to be what is promoted, so a changed run is rendered again and shown again)
- Never commit a .received.nt (it is the review copy; the committed contract is the .approved.nt)
