# Duplication detection

`pnpm run duplication:report` runs [jscpd](https://github.com/kucherenko/jscpd) (a pinned exact
dev dependency at the workspace root — no network at gate time) over `packages/*/src` and the test
tree separately, and writes a JSON report plus a summary line every commit.
`pnpm run duplication:check` (wired into `pnpm run check`) re-runs the report and then enforces
the duplication ratchet described below.

## What is measured

- **Language: TypeScript/TSX/JavaScript** — the actual source-code formats jscpd finds under the
  scanned directories (see "Formats", below, for why this is restricted rather than left to
  jscpd's own auto-detection).
- **Token floor: 60.** A match below 60 tokens is usually a coincidence — two unrelated functions
  that happen to share a short, common shape — not a structural copy worth acting on. `--min-lines
  1` is passed alongside it so the token floor is the *only* real gate; jscpd's own default
  `--min-lines 5` would otherwise be a second, undocumented threshold this build never asked for.
- **Identifiers and literals are ignored.** jscpd then finds *structural* duplication (the same
  shape with different names and values), not merely pasted text with the same names.
- **Main and test sources are scanned separately.** The test tree (`packages/*/__tests__/**` +
  `examples/**` + `tools/__tests__/**`) is reported — its numbers are in `duplication.json` and the
  summary line — but it never gates `duplication:check`. Test scaffolding and worked examples
  legitimately repeat (setup, fixture builders, assertion blocks); a fixed threshold there would be
  noise, not signal.

### Ignoring identifiers and literals

`--ignore-identifiers --ignore-literals` is the option pair that gives "structural duplication,
not merely pasted text" — `--mode strict` (a tokenizer-strictness knob, not an
identifier/literal-blindness one) is *not* it. Proof, from this repo's own
`tools/__tests__/duplication-jscpd-options.test.ts`, which runs the real pinned binary against a
fixture pair differing only in names and literals:

```ts
// a.ts
export function addNumbers(x: number, y: number): number {
  const total = x + y;
  console.log("sum computed");
  return total;
}

// b.ts
export function combineValues(m: number, n: number): number {
  const result = m + n;
  console.log("different message entirely");
  return result;
}
```

Without `--ignore-identifiers --ignore-literals`, jscpd reports **0** clones for this pair — every
identifier and the log message differ, so nothing textual matches. With both flags, it reports
**1** — the shared shape (two-parameter arithmetic function, a `console.log`, then a return) is
recognised regardless of what anything is named or what the literal says.

### Formats

jscpd auto-detects a file's format by extension across everything under a scanned directory, with
no restriction of its own. `tools/duplication-report.ts` passes
`--format typescript,tsx,javascript` on both invocations so this stays a code-duplication gate:
without it, the test tree's `examples/**` — which carries `.json`, `.yaml`, and `.html` fixtures
alongside real source — pulls in incidental near-identical example manifests as "duplication",
noise for this gate's purpose rather than a structural code finding.

## The ratchet, not a fixed percentage

A single "fail above N%" number is the wrong instrument: the right number depends on the token
floor and on how much of the tree is naturally repetitive (data tables, worked parallel adapters),
so a fixed threshold ends up either loose enough to never fire or tight enough to block unrelated
work. Instead, `tools/duplication-check.ts` ratchets against a committed baseline,
`config/duplication/baseline.properties`:

- **Fails when the main-tree percentage rises more than 0.3 percentage points above the recorded
  baseline** — a small tolerance that absorbs measurement noise between runs, not real growth.
- **Fails when a non-exempt cluster is larger than the baseline's recorded largest cluster** — a
  single new large duplicate block is a finding on its own, even while the overall percentage
  stays flat.
- **The test tree never fails the check**, whatever its percentage.

Lower the baseline with the same commit that removes the duplication it recorded. Never raise it
to make a failure go away — add a reasoned exemption instead (below), or leave the finding for a
later pass.

## Exemptions are data

`config/duplication/exemptions.txt` lists deliberate duplication: code that is intentionally
structured as two parallel copies rather than one shared abstraction, or a data table whose rows
are naturally identical once literals are ignored. Each entry is a `globA :: globB` pair (matched
against the repository-root-relative path jscpd reports) with a `# reason` line directly above it.
A cluster is exempt only when *every* one of its occurrences matches one of the pair's two globs —
a default-deny rule, so an unclassified cluster over the floor is always a finding, never a silent
pass. A pair with no reason above it, or a malformed pair, fails the build outright rather than
being ignored.

This repository's own data-table exemption: `packages/clarity/src/*-dictionary.ts` against itself
— the clarity module's word-list dictionaries (`abbreviation-dictionary.ts`,
`collocation-dictionary.ts`, `role-suffix-dictionary.ts`, `verb-dictionary.ts`) are rows of
structurally identical entries, so with literals ignored every row matches every other row. A
cluster that reaches outside the dictionaries (into `trace-namer.ts` or
`generic-token-detector.ts`, say) stays a finding.

### Ruled exemption categories (2026-09-12)

Every pair in `config/duplication/exemptions.txt` falls into one of three reasoned categories,
applied by hand as `globA :: globB` entries rather than by teaching the tool a content-based
matcher (that stays a follow-up if the exempt-file list keeps growing): **word tables** — a file
whose clustered regions are a word list, a `Set([...])` of strings, or an array/map literal of
data rows rather than logic, whatever the file is named (the clarity dictionaries,
`trace-namer.ts`'s naming tables, `generic-token-detector.ts`'s token-tier sets,
`attribute-tier.ts`'s field-to-scope lookup table, `scaffolding-bundle.ts`'s per-locale UI
strings); **wide-record builders** — `SpanContext`/`CanonicalEntry` and their field-by-field
merge/export shape, where one field or one conditional-spread line per component *is* the public
API, so collapsing the repetition into a name-keyed loop would change what callers can rely on;
and, deliberately absent, **cross-file coincidences** — two files whose clustered regions merely
happen to share a jscpd-visible shape without sharing a reason (`trace-namer.ts`'s naming tables
and `redaction-policy.ts`'s own, unrelated deny-list vocabulary land in the same shape once
identifiers and literals are ignored) stay unexempted findings on purpose: a pair only exempts a
cluster when *every* occurrence matches one of its two globs, so naming `trace-namer.ts` in a pair
never quietly covers whatever else it happens to resemble. A file whose clustered region mixes a
word table with a handful of small classification/lookup functions (every dictionary file, plus
`trace-namer.ts` and `generic-token-detector.ts`) is exempted at the file-pair level rather than
split into a separate data-only file the way Swift's port does — the reason above each such pair
names the specific functions this leaves as a known, unmeasured gap.

## Reading the report

`reports/duplication/duplication.json` is this build's normalised result:

```json
{"tool":"jscpd","language":"typescript","minTokens":60,
 "main":{"linesTotal":N,"linesDuplicated":N,"percent":x.y,
         "clusters":[{"tokens":N,"lines":N,
                       "occurrences":[{"file":"…","startLine":N,"endLine":N},
                                      {"file":"…","startLine":N,"endLine":N}]}]},
 "test":{"...":"same shape"}}
```

This shape follows the family-wide report format shared across NarrativeTrace runtimes, normalised
from jscpd's native output. Two things are specific to this port's tool:

- **`linesTotal`/`linesDuplicated` are line counts, not token counts.** jscpd reports every
  occurrence as a per-file line range (`startLine`/`endLine`), never a single shared token-index
  coordinate space — there is no cross-file position to
  union over by token. `percent` is therefore **a union over line ranges, grouped by file first**:
  a shape copied three times reports as
  three pairwise clusters, each re-covering the same lines (see the next point), and summing every
  cluster's line count once per occurrence would double- and triple-count those positions, so the
  union is computed over jscpd's per-file line numbers instead of a global token index. `percent`
  can therefore never exceed 100%.
- **Every cluster has exactly two occurrences.** jscpd's own `duplicates` array reports duplication
  as *pairs*: one entry names exactly two copies of a shape. A
  shape copied three times (A, B, and C all identical) therefore shows up here as two or three
  separate pairwise clusters (A↔B, A↔C, …), never one three-occurrence cluster. Reading the top of
  a report: several clusters sharing one file is the signal that file participates in a
  many-way duplicate, not a single cluster with a longer occurrence list.

The console prints one summary line per run:

```
duplication: main 16.1% of lines in 128 clusters (largest 1559 tokens
packages/core/src/trace-namer.ts:1 ↔ packages/core/src/trace-namer.ts:264)
· test 34.7% in 912 clusters (reported, not gated)
```

## Adding an exemption

1. Run `pnpm run duplication:report` and find the cluster in `reports/duplication/duplication.json`
   or the summary line.
2. Confirm it is deliberate — a genuine parallel structure or data table kept apart on purpose, not
   duplication nobody has gotten around to removing.
3. Add a `# reason` line and a `globA :: globB` pair to `config/duplication/exemptions.txt`.
4. Re-run `pnpm run duplication:check` to confirm it passes.

## Lowering the baseline

Remove the duplication, run `pnpm run duplication:report`, and update `main.percent` /
`main.largestCluster` in `config/duplication/baseline.properties` to the newly measured numbers in
the same commit — the same "floored to measured" idiom this build already uses for coverage and
mutation-score floors.

## The nightly JSON producer

`.github/workflows/duplication.yml` runs `pnpm run duplication:report` on a schedule (and on
manual dispatch) and uploads `reports/duplication/duplication.json` as a build artifact — the
input a cross-repo duplication resolver reads to compare every runtime's numbers side by side.
Building that resolver is a separate piece of work on its own branch, not part of this report/gate
pairing.
