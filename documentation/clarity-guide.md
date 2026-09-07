# NarrativeTrace TypeScript Clarity Guide

If the trace is the code, then trace quality is code quality. The clarity module analyzes your method, class, and parameter names and scores how well they communicate intent.

## Quick start

```ts
import { analyzeClarity, renderClarityReport } from "@narrativetrace/clarity";

const result = analyzeClarity(context.captureTrace());
console.log(renderClarityReport([{ scenario: "Order Placement", result }]));
```

With Vitest, clarity reports are generated automatically when using the `"clarity-json"` format — no code needed.

## What gets scored

Clarity produces a single overall score (0.0–1.0) from five weighted components:

| Component | Weight | What it measures |
|---|---|---|
| Method names | 30% | Verb quality, token specificity, abbreviations, token count |
| Parameter names | 25% | Domain specificity vs generic/meaningless tokens |
| Class names | 20% | Role suffix quality, prefix specificity |
| Structural | 15% | Parameter count and call depth penalties |
| Cohesion | 10% | Whether methods align with the class's role suffix |

## Scoring in practice

### Method names

The first token is treated as a verb. Domain verbs score highest, generic verbs score lowest:

| Verb category | Examples | Score |
|---|---|---|
| Domain | `calculate`, `validate`, `reserve`, `dispatch` | 0.60 |
| Standard | `create`, `find`, `delete`, `update` | 0.45 |
| Boolean prefix | `is`, `has`, `can`, `contains` | 1.00 |
| Generic | `get`, `set`, `process`, `handle`, `execute` | 0.10 |

Multi-token methods like `reserveInventory` score higher than single-token methods like `reserve` because the additional tokens add specificity.

### Class names

A role suffix is expected. Design pattern and functional suffixes score well when paired with a domain prefix:

| Pattern | Score | Why |
|---|---|---|
| `OrderService` | 1.0 | Domain prefix + functional suffix |
| `Service` | 0.0 | No prefix — meaningless |
| `DataProcessor` | Low | Vague prefix + generic suffix |
| `BookingManager` | Medium | Domain prefix, but `Manager` is generic |

### Parameter names

Domain-specific names score high, generic names score low:

| Tier | Examples | Score |
|---|---|---|
| Domain-specific | `customerId`, `checkInDate`, `roomCategory` | 0.80+ |
| Typed generic | `id`, `name`, `count`, `status` | 0.50 |
| Vague | `data`, `info`, `result`, `object` | 0.10 |
| Meaningless | `x`, `foo`, `val`, `temp` | 0.00 |

### Structural penalties

Methods with more than 4 parameters or call depth beyond 5 are penalized. Each excess parameter costs 0.1; each excess depth level costs 0.05.

### Cohesion

Methods are checked against expected verbs for the class's role suffix. A `Repository` class is expected to have methods like `find`, `save`, `delete`, `count`. A method like `renderReport` on a `GuestRepository` is flagged as misaligned.

## Issues and severity

Clarity problems are reported as issues ranked by impact:

| Severity | Threshold | Examples |
|---|---|---|
| HIGH | score <= 0.20 | `DataProcessor.execute(data)` |
| MEDIUM | score <= 0.50 | `BookingManager.handleBooking(name, type)` |
| LOW | score > 0.50 | Minor abbreviation use |

Duplicate issues (same category and element) are deduplicated with an occurrence count. Issues are ranked by impact score (severity weight x occurrences).

## Your own vocabulary, from the glossary you already have

The built-in dictionaries know general software English. They do not know that
`fold` is a verb in your domain, that `tranche` is a precise noun, or that `fx`
is your team's accepted shorthand — and a name they do not know scores as
unknown, not as domain-specific.

You teach them with the vocabulary file your repository already carries: the
committed `glossary.json` (ADR-012). There is no second dictionary file to keep
in sync.

| Glossary entry | Kind | What clarity learns |
|---|---|---|
| `settle trade` | `verb-phrase` | `settle` is a domain verb; `trade` is a domain noun |
| `credit tranche` | `noun-phrase` | `credit` and `tranche` are domain nouns |
| `foreign exchange` | `noun-phrase` | `foreign` and `exchange` are domain nouns |

Multi-word terms teach one token at a time, because identifiers are scored one
token at a time. Every bounded context contributes: an identifier carries no
module path, so context scoping cannot apply at scoring time.

### Accepted shorthand is declared, not inferred

Abbreviations live in their own root-level section (glossary schema 2):

```json
{
  "schemaVersion": 2,
  "abbreviations": { "fx": "foreign exchange", "calc": "calculate" }
}
```

A listed token is your team's word: the abbreviation dictionary stops asking for
it to be spelled out, and the expansion is there to teach from when it is
mentioned.

**Being a token of a committed term is deliberately not enough.** Harvesting the
phrase `calc total` must not quietly accept `calc` across the repository —
nobody read `calc` when they approved the phrase, and the `calc → calculate`
hint would vanish everywhere at once. Acceptance is a decision someone makes.

It also keeps the glossary honest about the ubiquitous language. To accept `fx`
you would otherwise have to commit `fx` as a canonical *term* — but the domain's
word is `foreign exchange`, and holding both makes two entries for one concept,
the thing a glossary exists to prevent (ADR-012).

The section is human-owned: harvesting never writes it, a merge carries it
through untouched, and it is rendered in `glossary.md` so the decision is
reviewed like any other. A glossary that declares no abbreviations keeps
stamping `"schemaVersion": 1` and serializes byte-for-byte as before.

### What the glossary cannot do

The built-in dictionaries keep their authority. A project can teach the scorers
a word they do not know; it cannot overrule a word they do.

- **Generic verbs stay generic.** Committing `process` or `handle` does not
  promote them, and the same holds for boolean prefixes (`is`, `has`).
- **Meaningless placeholders stay meaningless.** `temp`, `foo` and friends are
  not rescued by being written down.
- **Deprecated synonyms are never vocabulary.** An alias exists to be flagged;
  promoting it would silence the `non-canonical-term` issue it is declared for.
- **`stale` terms are not vocabulary.** Marking a term stale says the word left
  the domain.

Only the *committed* file counts. Nothing a run harvests feeds back into that
same run's scores — a self-expanding vocabulary would make scores
non-deterministic and self-certifying. The commit is the human approval.

### Where it applies

The Vitest fixture reads the glossary named by `NARRATIVETRACE_GLOSSARY_DIR`
(default: the working directory), memoized once per worker process. Reading is
unconditional — unlike harvesting, which is opt-in (`NARRATIVETRACE_GLOSSARY=true`)
because it rewrites files outside the artifact directory. A repository with no
`glossary.json` scores exactly as it did before this feature existed, and a
glossary that cannot be read degrades to the built-in dictionaries with a
warning rather than failing the suite.

```ts
import { analyzeClarity } from "@narrativetrace/clarity";
import { projectVocabulary } from "@narrativetrace/vitest";

// Scoring by hand, outside the fixture:
const result = analyzeClarity(tree, projectVocabulary());
```

`@narrativetrace/glossary` exposes the mapping itself — `glossaryVocabulary(glossary)`
for an already-parsed glossary, `readProjectVocabulary(dir, fileReader)` for one on
disk — so a non-Node host can supply its own file access.

## Report output

### Single scenario

```ts
import { analyzeClarity, renderClarityReport, type ScenarioResult } from "@narrativetrace/clarity";

const result = analyzeClarity(tree);
const scenarios: ScenarioResult[] = [{ scenario: "Guest books a room", result }];
console.log(renderClarityReport(scenarios));
```

Produces a Markdown report with a scores table and an issues table (if any):

```markdown
## Clarity Report — Guest books a room
Overall: 0.95 (high)

| Component  | Score |
|------------|-------|
| Method     | 0.98  |
| Class      | 1.00  |
| Parameter  | 0.90  |
| Structural | 1.00  |
| Cohesion   | 0.85  |
```

### Suite report

```ts
const scenarios: ScenarioResult[] = [
  { scenario: "Guest books a room", result: result1 },
  { scenario: "Legacy data processing", result: result2 },
];
console.log(renderClarityReport(scenarios));
```

Produces a ranked summary of all scenarios. Scenarios scoring below 0.7 get a detailed breakdown with individual issues.

### JSON export

```ts
import { exportClarityJson, exportClarityJsonReport } from "@narrativetrace/clarity";

// Single scenario
const json = exportClarityJson(result, { scenario: "Guest books a room" });

// Multi-scenario report
const reportJson = exportClarityJsonReport(scenarios);
```

## Vitest integration

Use the `"clarity-json"` format with `createNarrativeTest`:

```ts
import { createNarrativeTest } from "@narrativetrace/vitest";

const test = createNarrativeTest({
  outputDir: "narrativetrace-output",
  formats: ["md", "clarity-json"],
});

test("guest books a room", ({ narrativeContext }) => {
  // ... test code
});
```

After each test, a `.clarity-json` file is written alongside the trace output.

## Static scanner CLI

The static scanner analyzes source files directly — no tests needed:

```bash
npx tsx tools/clarity-scan.ts
```

### Options

| Flag | Effect |
|------|--------|
| `--min-score=0.80` | Exit with error if any class scores below the threshold |
| `--json` | Output as JSON instead of Markdown |

### Examples

```bash
# Scan all packages, human-readable output
npx tsx tools/clarity-scan.ts

# Enforce minimum score in CI
npx tsx tools/clarity-scan.ts --min-score=0.80

# JSON output for tooling
npx tsx tools/clarity-scan.ts --json
```

### How it works

1. Finds all `.ts` source files across packages (excluding tests and declarations)
2. Parses each file using the TypeScript Compiler API
3. Extracts classes with their methods and parameters
4. Runs `analyzeClarity()` on each class
5. Renders a clarity report or exits with error if below threshold

## CI enforcement

Clarity is a build gate, not just a report. Two entry points enforce it, and both exit non-zero when the naming quality budget is blown so CI fails the build.

### The `check` gate

The root `pnpm run check` quality gate runs the clarity gate as one of its stages via the `clarity:gate` script:

```bash
# What pnpm run clarity:gate actually runs:
tsx tools/clarity-scan.ts --min-score 0.4 --max-high-issues 15
```

This statically scans every `packages/*/src` source file, scores each class, and fails the build if any class scores below `0.4` **or** the suite produces more than `15` HIGH-severity issues. Tune those two numbers to move the bar.

### `tools/clarity-scan.ts` flags

The static scanner accepts both `--flag value` and `--flag=value` forms:

| Flag | Effect |
|------|--------|
| `--min-score <n>` | Fail if any scanned class scores below `<n>` |
| `--max-high-issues <n>` | Fail if the suite has more than `<n>` HIGH-severity issues |
| `--warn-only` | Print violations as `warning:` but exit `0` (report without blocking) |
| `--format <both\|md\|json>` | With `--output-dir`, which suite artifacts to write |
| `--output-dir <dir>` | Write `clarity-report.md` and/or `clarity-results.json` to `<dir>` instead of printing |
| `--json` | Print the suite JSON to stdout instead of Markdown |

**Exit codes:** `0` pass, `1` gate failure (a `--min-score` or `--max-high-issues` violation without `--warn-only`), `2` usage error (an unknown `--format` value). Example CI invocations:

```bash
# Strict gate — fail on the first sub-threshold class
tsx tools/clarity-scan.ts --min-score 0.80

# Gate on HIGH-issue count and emit artifacts for the pipeline to archive
tsx tools/clarity-scan.ts --max-high-issues 15 --output-dir clarity-out --format both

# Observe-only: surface warnings on PRs without failing the build yet
tsx tools/clarity-scan.ts --min-score 0.80 --warn-only
```

### The `narrativetrace-clarity` bin

`@narrativetrace/clarity` also ships a `narrativetrace-clarity` bin. Instead of scanning source, it re-renders and gates an **already-accumulated** suite `clarity-results.json` (the file the Vitest reporter writes — see below), so it drops into a pipeline stage that runs after the test suite:

```bash
narrativetrace-clarity --min-score 0.4 --max-high-issues 15
```

| Flag | Effect |
|------|--------|
| `--input <file>` | Results file to read (default `<output-dir>/clarity-results.json`) |
| `--output-dir <dir>` | Where re-rendered artifacts are written (default `.`) |
| `--format <both\|md\|json>` | Which artifacts to re-render |
| `--min-score <n>` | Fail if a scenario scores below `<n>` |
| `--max-high-issues <n>` | Fail if the suite exceeds `<n>` HIGH-severity issues |
| `--warn-only` | Print violations as `warning:` and exit `0` |

**Exit codes:** `0` pass, `1` gate failure or an IO error (e.g. the input file is missing or unreadable), `2` usage error (an unknown `--format` value or any unknown argument).

### Producing the results file from Vitest

The gate's input is produced by the Vitest `ClaritySuiteReporter`. Once every test file in a run has finished, it writes exactly **one** `clarity-results.json` and **one** `clarity-report.md` for the whole suite (into the reporter's `outputDir`, defaulting to `narrativetrace-output`). A run with no clarity metadata writes nothing. Point `narrativetrace-clarity --input` at that `clarity-results.json` to gate the build on the suite's aggregate naming quality.

## NLP components

The clarity module uses hand-coded NLP with no external dependencies:

| Component | Purpose |
|---|---|
| `IdentifierTokenizer` | Splits camelCase, snake_case, underscores, and digit boundaries into tokens |
| `VerbDictionary` | Categorizes verbs into domain/standard/generic/boolean with 500+ domain-covered verbs (including collocation/role-derived coverage) |
| `RoleSuffixDictionary` | Classifies class suffixes (design pattern, functional, generic) |
| `GenericTokenDetector` | Ranks token specificity (meaningless -> domain-specific) |
| `AbbreviationDictionary` | Scores 187 abbreviations in three tiers (universal, well-known, ambiguous) |
| `MorphologyAnalyzer` | Detects parts of speech via suffixes (-tion, -ize, -able) |
| `CollocationDictionary` | Validates verb-noun pairings across 209 merged nouns (domain-map merge semantics) |
| `CohesionScorer` | Checks method-verb alignment with class role expectations |
| `DomainVocabulary` | The project's own words, read from the committed glossary; extends every dictionary above without overriding it |

## Dictionary guardrails

Clarity dictionaries are protected by automated guardrails:

- Property-based invariants (`fast-check`) verify case-insensitive lookups for collocations, role expectations, and abbreviations.
- Consistency checks verify collocation verbs and role-expected verbs are always classified by `VerbDictionary`.
- Drift guard tests enforce conservative lower bounds for dictionary sizes and print current metrics during test runs.

## See also

- [Configuration Guide](configuration-guide.md) — tracing levels, output configuration
- [Decorators Guide](decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`
- [Installation Guide](installation-guide.md) — dependencies and integration paths
