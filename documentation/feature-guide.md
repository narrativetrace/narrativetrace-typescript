# NarrativeTrace TypeScript — Feature Guide

What **NarrativeTrace for TypeScript** ships, from a user's perspective. The
canonical all-platform feature catalog — every NarrativeTrace feature on every
platform, with the authoritative status vocabulary — lives in
[the canonical feature guide](https://github.com/narrativetrace/narrativetrace-java/blob/main/documentation/feature-guide.md).
This file is deliberately thin: it records only what the TypeScript
packages deliver, where they differ from the canonical catalog, and
what is coming to this platform next — mechanism *why* (decorators + ES
Proxy over loader-hook instrumentation, the platform package split, the
bounded-buffer pipeline) is an internal engineering record, not repeated
here.

**Status labels** (same vocabulary as the canonical guide):

- **Free** — shipped in this repository, free and source-available under
  [BSL 1.1](../LICENSE) (SPDX `BUSL-1.1`), converting to Apache 2.0 four
  years after each release. The annotation/decorator API, the output-format
  spec and the clarity rubric are Apache 2.0 open standards.
- **Pro** — shipped in the commercial tier.
- **In development** — actively being built; the design is settled.
- **Planned** — specified, not yet started; may change.

---

## Capture the story of your code (core tracing)

| Feature | Status | Notes |
|---|---|---|
| Automatic narrative capture via ES `Proxy` — class, method, arguments, return values, timing, errors; zero log statements | Free | `traceObject(service, context)` from `@narrativetrace/proxy` |
| Decorators — `@traced` (parameter names), `@narrated` (narration with `{param}` templates), `@onError` (error context templates), `@notTraced` (redaction) | Free | Both decorator dialects (standard TC39 and legacy `experimentalDecorators`), TS 5.0+; [decorators-guide.md](decorators-guide.md) |
| Programmatic API for plain JS — `traceObject(service, context, { methods: { method: { params, narration, onError, notTraced } } })` per-method config (config twin of every decorator), `{ method: ["paramA", …] }` name-map shorthand, and the raw `NarrativeContext` enter/exit API | Free | Full feature set without decorator support |
| Sensitive data redaction — `@notTraced` indices, `static notTraced` field lists, name-pattern `RedactionPolicy` deny-list, multilingual and always on (`password`, `token`, `contraseña`, `senha`, `motDePasse`, `密码`, …); redacted values cannot leak through narration/error templates | Free | |
| Five capture levels (`off` → `errors` → `summary` → `narrative` → `detail`), changeable at runtime via `config.level`; `NARRATIVETRACE_LEVEL` env on Node | Free | Level names differ slightly from Java (`summary` vs `FLOW`); `off` short-circuits before any capture work |
| Two-gate levels — capture level independent of logger levels (winston/pino config) | Free | Product ADR-008 |
| Eager value serialization — values rendered to strings at call time; no object retention, circular-safe, truncation limits | Free | See README FAQ + purity contract in the decorators guide |
| Trace identity — traceId, human-readable trace names, storyId/chapterId, W3C `traceparent` inheritance across services | Free | Canonical-schema aligned; distributed demo in `examples/` |

**Platform limitation (know this up front).** JavaScript does not
retain parameter names at runtime — without help, arguments render as
`arg0`, `arg1`, …. Tier-2 annotations therefore carry more weight here
than on the JVM: `@traced("customerId", …)` or the `paramNames` map is
how traces get real names, and minifiers make this mandatory for
production bundles. See TS-004 in the platform ADL.

## Concurrency and async context

| Feature | Status | Notes |
|---|---|---|
| `AsyncLocalStorage` per-request context on Node (`AsyncNarrativeContext` in `@narrativetrace/core-node`) — traces never bleed across concurrent requests | Free | TS-001 in the platform ADL |
| Fork/join groups — parallel tasks under one trace with per-member timing and wait-time analysis (`ForkJoinGroup.all`) | Free | |
| Fire-and-forget groups — background work that still appears in the trace (`FireAndForgetGroup`) | Free | |
| Sequential-async interleaving detection; browser rule: un-awaited overlapping calls on a shared `SyncNarrativeContext` require an explicit group | Free | [framework-integration-guide.md](framework-integration-guide.md) |
| Shutdown auto-flush on Node (`beforeExit`/`SIGTERM`) so buffered tail events are not lost | Free | `registerAutoFlush` in core-node |

## Attach it to your stack (the 19 packages)

| Integration | Status | Notes |
|---|---|---|
| `core` / `core-node` / `core-web` — platform-agnostic core + Node and browser runtime seams | Free | TS-005 in the platform ADL |
| `proxy` — `traceObject` ES Proxy + decorators | Free | The usual entry point |
| `express` — per-request middleware, fail-safe extractors, `onRequestComplete` | Free | |
| `hono` — edge/serverless middleware, `finally`-completion parity with Express | Free | |
| `nestjs` — `AutoProxyModule.forRoot({ pipeline, consumers, onRequestComplete })` | Free | |
| `angular` — `provideNarrativeTrace()`, HTTP interceptor, DI tracing | Free | |
| `react` — hooks/provider for component + service traces | Free | |
| `react-router` — navigation capture | Free | |
| `vitest` — `narrativeTest` fixture, per-test trace files (`md`/`mmd`/`puml`/`json`/`clarity-json`/`canonical-json`), console summary + clarity reporters | Free | |
| Canonical schema 1.2 + writer-validated artifacts | Free | `nt.schemaVersion` `1.2` from one `SCHEMA_VERSION` constant; per-test `.canonical.json` (flat entry list, deterministic for a context-free capture); the schemas live in `schema/` and a conformance test validates the bytes `writeTraceOutput` writes, not hand-built input |
| `winston` / `pino` — narrative events through your existing logger, typed fields, configurable per-event levels | Free | TS-003 in the platform ADL |
| `observability` — log-scope enricher (`trace_id`, `code.*`, `service.*`, `nt.depth`) + request middleware | Free | |
| `opentelemetry` — live `createOtelEventConsumer` + batch `TraceSpanExporter`, typed `narrative.param.*` attributes | Free | |
| `browser` — console renderer, network export, traced `fetch` | Free | |
| `clarity` / `diagrams` — see the sections below | Free | |

Not on this platform: a Java-agent equivalent (loader/require-hook
auto-instrumentation) is deliberately **not** offered — see TS-004.

## Read the story (outputs)

| Feature | Status | Notes |
|---|---|---|
| Indented text, Markdown, and prose renderers | Free | |
| Trace value references — content-addressed dedup of repeated captured values with readable labels (`‹Hotel›=full` on first emission, `‹Hotel›` after) | Free | Labels come from the structured value's identity field (name/id/description/…), never a redacted one; byte equality certifies sameness; containment inside other captured values counts and is replaced. Markdown only |
| Intra-trace value deltas — a re-capture of the same entity, changed, renders as a diff against the reference (`‹Dinner›′{amount: 100→92, currency: "USD"→"EUR"}`) | Free | "Same entity" is the same structured type name plus an equal identity field; changed scalar fields only (string, number, boolean, and the pre-stringified `other` kind), never reconstructed from the structured tree. A changed nested object or list, a different field set, or a value with no identity field renders in full exactly as before. A changed variant that itself repeats is defined AS the diff (`‹Dinner·2›=‹Dinner›′{…}`). Markdown only |
| Canonical JSON export — versioned envelope (`version`, `scenario`, `trace`, `events[]`) with storyId/chapterId fields | Free | `exportJson(tree, { scenario })` |
| Sequence diagrams — Mermaid + PlantUML | Free | `@narrativetrace/diagrams` |
| Per-test trace files + console test summaries via Vitest | Free | |
| Flow summaries — aggregated paths + frequencies per entry point | Planned (Pro) | Enterprise plan Phase E3 |
| Migration diffs — behavioral before/after comparison | Planned (Pro) | Enterprise plan Phase E3 |
| Runtime dependency graphs (always-called vs conditional) | Planned (Pro) | Enterprise plan Phase E4 |

## Improve the code (clarity diagnostics)

| Feature | Status | Notes |
|---|---|---|
| Clarity scoring — method/class/parameter naming quality from real execution | Free | [clarity-guide.md](clarity-guide.md); the README labels clarity scoring **experimental** |
| Suite-level clarity report + `clarity-results.json` gate | Free | Via the Vitest reporters |
| Project vocabulary in scoring — the committed glossary extends the built-in dictionaries | Free | One file, one review workflow: verbs of the committed `glossary.json` score as domain verbs and its nouns as domain tokens. Read from `NARRATIVETRACE_GLOSSARY_DIR` (default: working directory), memoized per worker; reading is unconditional, unlike harvesting. Built-in tiers keep authority — generic verbs, boolean prefixes, meaningless placeholders, deprecated synonyms and `stale` terms are never promoted |
| Accepted shorthand — the glossary's `abbreviations` section | Free | Root-level `"abbreviations": {"fx": "foreign exchange"}` at schema 2; a listed token is not asked to be spelled out and carries an expansion to teach from. Declared, never inferred from the tokens of committed terms. Human-owned: harvesting never writes it, merge passes it through, `glossary.md` renders it. A glossary declaring none stays byte-identical at schema 1 |

## Pro tier (commercial)

| Feature | Status | Notes |
|---|---|---|
| Event-stream aggregation — `@narrativetrace/pro-aggregate` with the `EventAggregator` facade (aggregate trees, hotspots, error paths/rates, method/error frequencies) | Pro | Relocated out of the free core 2026-07-12 (Phase 31a tier split, product ADR-010); buffering/retention stayed free — feed `pipeline.events()` into `EventAggregator` |
| MCP server — real stdio transport (`@modelcontextprotocol/sdk`), 7 analysis tools, connect Claude Code / Cursor directly | In development (Pro) | Enterprise plan Phase E5; goes beyond Java's handlers-only module |
| Flow summaries, migration diffs, dependency-graph diagrams | Planned (Pro) | Phases E3–E4, see above |
| Audit & compliance suite | Planned (Pro) | Gated — see the canonical guide's audit section |

---

## Keeping this guide honest

Adapted from the canonical guide's rules for a thin platform guide:

1. Every user-visible feature **of this runtime** appears here, exactly
   once, with a status. Cross-platform feature definitions and the
   full catalog live only in the canonical guide — this file never
   restates features this runtime does not ship or plan.
2. A feature moves to **Free**/**Pro** only when it is merged, tested,
   and documented in the relevant TS repository. "In development"
   means the design is settled and work is scheduled; "Planned" means
   specified only.
3. Changes that add or promote a feature in this repo must update this
   file in the same commit — and, when the feature is new to the
   product (not just to this runtime), the canonical guide too.
4. Where TS behavior differs from the canonical description (level
   names, runtime parameter names, no agent-style instrumentation),
   the difference is stated here, not silently absorbed.
