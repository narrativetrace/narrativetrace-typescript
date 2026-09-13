# Structural Trace Format (`.nt`)

The AI-safe structural trace artifact: one file per test scenario containing
only the developer-authored *shape* of the behavior — zero runtime values.
This format is **cross-platform**: every NarrativeTrace runtime emits the
identical format, which is what lets approved traces and conformance
fixtures travel between platforms.

## Files and naming

| File | Role |
|---|---|
| `narrativetrace-output/structural/<module>/<scenario>.nt` | Emitted for every `createNarrativeTest` scenario; the file on disk is the **last-green baseline** — a non-green run compares against it (console delta, failure report) but never overwrites it. "Green" is the whole verdict: a test that passed but whose structure approval *rejected* ends red, so a rejected structure never becomes the baseline and reverting the change reports no delta |
| `<approvedDir>/<module>/<scenario>.approved.nt` | Committed approved trace (opt-in via `approval: true`, directory configurable via `approvedDir`, default `narratives/`) — a passing test whose structure differs fails with a readable diff |
| `<scenario>.received.nt` | Written beside the approved trace on a mismatch (or when none exists yet); review it, then promote via `pnpm run approve-narratives` (or the `narrativetrace-approve` bin) |
| `<scenario>.incomplete.nt` | The same content, written instead of `.received.nt` when the run itself was incomplete (the best-effort path dropped events, or refused an async scope). `approve-narratives` ignores it by name: a short run must never become the committed baseline, or every later complete run reads as having *added* calls. Such a run is compared by subsequence containment rather than equality — absences are tolerated and named, anything added or reordered still fails |

The format extension is last (`.approved.nt`, ApprovalTests convention) so
editors and diff viewers key off `.nt`. Note: `.nt` collides with RDF
N-Triples in some syntax-highlighting maps; register an override in
`.gitattributes` where it matters.

### Artifact identity

`<scenario>` above is the **artifact identity** of one test invocation, and
every runtime spells it the same way — an artifact written by one runtime is
found under the same name by another:

- An ordinary test is its slugged name: camelCase/spaces split on word
  boundaries, lowercased, everything outside `[a-z0-9_]` replaced with `_` —
  `customerPlacesOrder` → `customer_places_order`.
- One invocation of a `createNarrativeTest(...).each(cases)` row appends
  `-<index>-<label>`: the 1-based invocation number zero-padded to three
  digits, then the invocation's interpolated label through the same slug
  rule with runs of `_` collapsed and the ends trimmed —
  `equipment_can_be_found-002-find_tent`. A label that slugs to nothing is
  dropped, leaving `equipment_can_be_found-002`.
- `-` is the separator precisely because the slug alphabet cannot produce
  one: the index — not the label — is what makes the scheme collision-proof,
  so display names that differ only in characters a path cannot carry
  (`find/TENT` versus `find TENT`) still get separate files. The label is
  what makes the name readable.
- The name is stable across runs, machines and processes, which is what lets
  one invocation's `.approved.nt` be committed at all. Where a name exceeds
  the 255-byte path-element limit the *test* half is truncated and given
  eight hex characters of the Java-compatible `String#hashCode` of the full
  slug — specified, therefore identical everywhere; a per-process hash would
  silently invalidate every baseline it touched.

> An invocation's `scenario:` header is **not** its interpolated label. A
> `.each(cases)` row template like `"finds %s"` interpolates arguments into
> the display name, so this artifact — the value-free one — is titled by the
> test name and the invocation number instead: `finds equipment #2`. A test
> that runs once keeps the display name it always had, so no committed
> baseline moves. The *filename* still carries the slugged label, because
> that is what tells two invocations apart on disk, and `manifest.json` — an
> index over the value-carrying artifacts too — names the scenario as the
> runner displayed it. Keep secrets out of `.each` name templates.

## Content

```
scenario: Weekend trip settles with three transfers

- TripSettlementService.recordExpense(tripName, expense)
  - ExpenseValidator.ensureValid(expense)
  - TripLedger.recordExpense(tripName, expense)
- TripSettlementService.settleTrip(tripName) → value
  - TripLedger.expensesOf(tripName) → value
  ~ fork [2]
    - BalanceCalculator.computeBalances(expenses) → value
    - StockService.check() → value
```

- **Header:** `scenario: <humanized test name>` + blank line. Nothing
  else — no result, no trace ids/names, no dates. One invocation of a
  `.each` row is `scenario: <humanized test name> #<index>` — an
  interpolated label never reaches it.
- **Call line:** `ClassName.methodName(paramName, paramName)` — names
  only, capture order, two-space indent per depth.
- **Outcome kinds:** non-void return ` → value`; void: nothing (the
  Returned-null contract); thrown ` !! ExceptionSimpleName` (type is
  structure; the message is a value and never appears); unmatched
  enter ` ?? incomplete`.
- **Concurrency:** fork groups render `~ fork [n]` and work adopted from
  a propagated context (an async boundary crossed and adopted back) renders
  `~ async [n]`, both with members **sorted by `Class.method`** — capture
  order across concurrent tasks is the scheduler's choice, not behaviour, so
  the artifact states the set and nesting of concurrent work and never its
  order. Fire-and-forget renders `~ fire-and-forget` + children (the
  launching call itself is not part of this scenario's shape, only the work
  it started is). Thread/task identity never appears.
- **Excluded by design:** all argument/return values, exception
  messages, durations, timestamps, thread identity, trace/span ids,
  trace names, **run ids/names** *(since 0.1.3, unreleased)*, run results, and narration.
- **Encoding:** UTF-8, LF, trailing newline. Identifiers pass through
  control-character sanitization.

## Guarantees

1. **Deterministic:** identical behavior ⇒ byte-identical file. This
   is what makes the artifact the approval baseline and the
   conformance-fixture golden format.
2. **Value-free:** zero prompt-injection surface, zero PII, minimal
   tokens — safe to hand to an AI agent by default.
3. **Division of labor:** the artifact asserts behavioral *shape*;
   value correctness remains the job of test assertions. A change
   that only alters a return value with identical structure does not
   change the artifact — by design.

## Approval traces, end to end

The approval-testing idea, applied to traces: a committed `.approved.nt` is
the behavioral contract, and a passing test whose structure differs fails
with a readable diff instead of silently passing.

```text
test passes
   |
   v
compare current structure to the approved trace
   |
   +-- same      --> pass, nothing written
   +-- different --> write .received.nt and fail
                     |
                     v
                human reviews the diff
                     |
                     v
              pnpm run approve-narratives
                     |
                     v
              .approved.nt updated, commit it
```

The failing state is deliberate: a passing test whose *shape* changed —
including a change an AI agent slipped into an otherwise-correct refactor —
has to be looked at and explicitly approved, not merely compile. Nothing is
silently accepted, and nothing is silently lost: an incomplete run writes
`.incomplete.nt` instead and is compared by subsequence containment rather
than equality, so a short run can never become the committed baseline. See
[Configuration Guide § 2](configuration-guide.md#2-vitest-configuration) for
the `approval`/`approvedDir` options and [What to Commit](what-to-commit.md)
for why the approved trace is the one artifact in this list you commit.

Implemented in this package by `renderStructural`/`renderStructuralDocument`
(`@narrativetrace/core`) and wired into `createNarrativeTest` by
`@narrativetrace/vitest`.
