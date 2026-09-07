# @narrativetrace/glossary

The domain glossary of a repository: bounded contexts and their canonical terms,
harvested from traces and curated by hand.

One checked-in artifact serves three purposes at once — the translation
dictionary, the reviewable domain documentation, and the vocabulary norm that
clarity diagnostics enforce.

## Install

```bash
pnpm add @narrativetrace/glossary
```

Zero runtime dependencies.

## The artifact

`glossary.json` at the repository root is the single editable source;
`glossary.md` is a generated view for PR review. Serialization is deterministic
— contexts sorted by name, terms in `(context, term)` order, fixed key order,
2-space indent, trailing newline — so an unchanged vocabulary leaves the file
byte-identical.

```json
{
  "schemaVersion": 1,
  "contexts": {
    "billing": {
      "packages": ["packages/billing"],
      "description": "Charging, invoicing, funds"
    }
  },
  "terms": [
    {
      "term": "overdraft account",
      "context": "billing",
      "kind": "noun-phrase",
      "status": "curated",
      "definition": "Account permitted to go below zero up to an agreed limit.",
      "translations": { "es": "cuenta con descubierto" },
      "synonyms": [{ "alias": "account with overdraft", "note": "legacy v1 API phrasing" }],
      "sources": ["billing.OverdraftService.openOverdraftAccount"],
      "firstSeen": "2026-08-13"
    }
  ]
}
```

Term identity is `(context, term)`: the same normalized term may exist
independently in two contexts with different definitions and translations.

Human-authored fields — `definition`, `translations`, `synonyms`, and a
`curated` status — are never overwritten by harvesting.

## Usage

```ts
import { boundedContext, synonymAlias } from '@narrativetrace/glossary';

const billing = boundedContext('billing', ['packages/billing'], 'Charging, invoicing, funds');
const legacy = synonymAlias('account with overdraft', 'legacy v1 API phrasing');
```

## Harvesting a run

Harvesting reads captured trace trees and proposes vocabulary; merging decides
what joins the glossary. The merge is additive and idempotent — it never removes
or rewrites an entry, and re-running it changes nothing — so a test run that
finds no new vocabulary leaves `glossary.json` byte-identical.

```ts
import { harvestTraces, mergeHarvest } from '@narrativetrace/glossary';

const harvest = harvestTraces(model, trees, (className) => sourcePaths.get(className));
const { glossary, newTerms, suppressedAliasUses } = mergeHarvest(model, harvest, '2026-08-13');
```

`firstSeen` is passed in rather than read from the clock, so a harvest is a pure
function of its inputs and can be re-run over stored traces.

## Vocabulary violations

A harvested phrase that is a declared synonym is never added as a term. It is
reported instead, with a mechanical rename derived from the identifier's own
casing:

```ts
import {
  collectViolations,
  formatVocabularySummary,
  nonCanonicalTermIssues,
  renderGlossaryUsageReport,
} from '@narrativetrace/glossary';

const violations = collectViolations(model, suppressedAliasUses);

formatVocabularySummary(newTerms.length, violations);
// Vocabulary: 3 new terms harvested, 1 deprecated synonym in use
//   openAccountWithOverdraft → use openOverdraftAccount (billing: "overdraft account")

nonCanonicalTermIssues(violations);                            // clarity issues, severity MEDIUM
renderGlossaryUsageReport(harvest, newTerms, violations);      // glossary-usage.json text
```

Violations and usage counts live in run artifacts only, never in the committed
glossary. Rendering is separate from writing: this package touches no
filesystem, so the caller owns the files.

## Translating stored traces

A curated glossary is a translation dictionary, so any stored trace can be read
back in another language. Translation is a pure function of stored files: it
re-runs over historical traces and always produces the same bytes.

```ts
import { runTraceTranslation } from '@narrativetrace/glossary';

const { files, summary } = runTraceTranslation({
  glossaryJson,                                   // text of the committed glossary.json
  traces: [{ path: 'narrativetrace-output/payment/charge_fails.json', json }],
  locales: ['es'],
  sourcePathOf: (className) => sourcePaths.get(className),
});
```

Each file carries its translated Markdown and the phrases that fell through:

```md
**Escenario:** charge fails when funds are insufficient

## Flujo de llamadas

- `PaymentService.cobrar [charge](cliente: "C-BROKE", importe: 74.97)` ❌ fondos insuficientes [InsufficientFundsException]: balance 12.50 below required 74.97

## Vacíos del glosario

- billing: `payment`
```

Three rules hold by construction:

- **Values are never touched.** Every line is re-derived from the trace's
  structural fields; the pre-rendered `message` text is never parsed or
  substituted into, so no captured value, return value or error message can be
  altered by translation — not even one that spells out a glossary term.
- **The original stays beside the gloss**, so a translated line is still
  greppable against the canonical log.
- **Whatever the glossary cannot say degrades to English** and is listed in the
  file's gaps footer, which is the work queue that drives curation.

Scaffolding — headings and labels — ships with the library for the locales in
`SCAFFOLDING_LOCALES`, and falls back to English (`es-CL` reads `es`), so a
repository that has curated no vocabulary yet still gets a readable file.

From the command line, translating what a test run left behind:

```bash
pnpm run translate-traces --locale es,de --source-dir packages
```

Output mirrors the trace tree under `narrativetrace-output/traces-<locale>/`.
`--source-dir` is what resolves class names to bounded contexts; without it
every term files under `_unassigned` and nothing translates, which the run says
out loud.

## License

Business Source License 1.1 — free to use in production; each release
converts to Apache 2.0 four years after publication. See the repository
root LICENSE (shipped in this package) for the binding text.
