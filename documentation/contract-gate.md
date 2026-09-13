# The contract gate

`documentation/contract.yaml` is a machine-readable list of claims this repository's
documentation makes — a default, an entry point, a config shape, or the effect a documented shape
produces. `contract-probe/` proves or disproves each one against a **published** install (the real
npm registry, never `workspace:`/`link:`/`file:`), so a doc page and the tarball someone actually
`npm install`ed can never quietly disagree without a gate noticing.

This is the third leg of the docs-vs-published family, alongside the `*(since X.Y.Z[,
unreleased])*` markers inline in prose and the generated banner at the top of `documentation/llms.txt`
— see those markers throughout `documentation/*.md` for the disclosure half of the same problem.
This page is the enforcement half: a marker says "this is new"; the contract gate says "and it is
really true of what shipped."

## What it catches

Four kinds of claim, each checked a different way:

| `kind` | What it proves | Example |
|---|---|---|
| `entry-point` | A package resolves at all, on the real npm registry, at the version under test | `@narrativetrace/core` |
| `reflectable-default` | The published `package.json` already says what the docs claim — no execution needed | `@narrativetrace/core`'s `engines.node` is `>=20` |
| `probed-default` | A default only visible at runtime (an env var's effect, a redaction decision) | `NARRATIVETRACE_OUTPUT` defaults to `true` |
| `config-shape` | A documented configuration shape produces the effect the docs claim | `@narrativetrace/vitest/reporters` is an importable subpath |

Each entry also carries `since`: the version the claim first holds. An entry whose `since` is
**later than the version actually installed** that run is reported `not-applicable-before-since`
— never `fails` — so a documented default for a feature that has not shipped yet does not fail the
gate before its own release does. The exemption is keyed on the version genuinely installed, never
on this repository's own `packages/core/package.json` version, which stays ahead of the last
published number until a release tag catches up (see the `*(since X.Y.Z, unreleased)*` markers
already on many pages).

## Two gates, two cadences

- **`pnpm run contract-lint`** — part of `pnpm run check`, every commit, no network. Validates
  `documentation/contract.yaml` itself: the schema parses, every `since` is a real version string,
  no two entries make the same claim, every entry's `probe` file exists, every `page#anchor`
  pointer resolves to a heading that actually exists on that page, and every `*(since X.Y.Z,
  unreleased)*` marker anywhere in the English docs has at least one contract entry recording that
  version — the mechanical link between the inline markers and this file.
- **`pnpm run contract-check`** — nightly, registry-backed, never per commit (the same
  "no network in the per-commit gate" rule the security scanners follow). Resolves the version to
  check the way `tools/verify-publication.ts` does (the newest `v*` tag reachable from HEAD, else
  npm's own `latest` dist-tag for `@narrativetrace/core`), installs it into a **fresh temp
  directory with a fresh npm cache** — never this checkout's own `node_modules`, never a
  `workspace:`/`link:`/`file:` reference standing in for the real answer — and runs
  `contract-probe/run.ts` against it. Exits non-zero on any `fails`.

Run the nightly gate by hand against a specific version:

```bash
pnpm run contract-check 0.1.1
pnpm run contract-check          # omit the version: checks the last published one
pnpm run contract-check -- --dry-run
```

A failure names all four facts in one line, so a skim is enough:

```
documentation/contract.yaml: probed-narrativetrace-output-default documented default "true"
(since 0.1.3) but probed-narrativetrace-output-default 0.1.3 (published) reads "false"
```

## `contract-probe/`

A small, **standalone** directory — its own `package.json`, no `"type"` field of its own (see that
file's own comment for why) — deliberately outside `pnpm-workspace.yaml`'s globs (`packages/*` and
`examples/*` only), so it is never a workspace member. That separation is the point: the packages
its probes import are installed fresh, by `tools/contract-check.ts`, straight from the npm
registry at the version under test — never this checkout's own build output. It ships in the
public snapshot: it is real code proving a documented claim, not private verification machinery.

Run it directly, against an already-installed scratch project:

```bash
npx tsx contract-probe/run.ts --contract documentation/contract.yaml \
    --version 0.1.1 --cwd /path/to/an/npm-installed/scratch/project --out /tmp/contract-result.json
```

Each contract entry names its own probe script under `contract-probe/probes/` — `entry-point`
entries share one (`entry-point.mjs`, an HTTP presence check against the registry, no install
needed); every other kind's probe is copied into `--cwd` and run there with plain `node`, so its
bare-specifier imports (`@narrativetrace/core`, …) resolve against that scratch project's own
`node_modules` — never this repository's. A probe prints exactly one line to stdout: the observed
value. The entry holds when it equals `documented_default` (or `expected_effect`, the name the
design note uses for a `config-shape` entry — both land in the same field internally, see
`tools/contract-decision.ts`).

## Adding an entry

`contract.yaml` is updated **in the same commit** as the feature that ships a new documented
default — the same discipline the Pro repository's `pro/schema/*.json` files follow. Adding one:

1. Write the sentence in the doc page first, with its `*(since X.Y.Z, unreleased)*` marker if the
   version has not tagged yet.
2. Add the entry to `documentation/contract.yaml`: `id`, `kind`, `page` (the doc path and the
   anchor of the heading carrying the sentence), `claim`, `since`,
   `documented_default`/`expected_effect`, and `probe`.
3. Write the probe under `contract-probe/probes/<id>.mjs`. Use only the package's stable public
   API — the probe runs against whatever single version `contract-check` resolves, so it must not
   assume an API shape newer than the OLDEST version the entry's `since` could ever be checked
   against.
4. `pnpm run contract-lint` — confirms the shape, the anchor and the since-marker link.
5. `pnpm run contract-check` — confirms the new entry reports `not-applicable-before-since`
   against today's published version (it should, if the feature has not released yet) and, once
   released, reports `holds` against the version it landed in.

## What this deliberately does not cover

- **Prose accuracy outside `contract.yaml`.** A documented explanation that is simply wrong,
  incomplete, or confusing is a different failure mode — review catches that, not a runtime probe.
- **Anything the sixty-seconds tutorial's own proof already owns** (`tools/verify-publication-smoke.ts`)
  — `contract.yaml` is for defaults and shapes documented elsewhere, not a second copy of that
  page's own proof.
- **Full behavioral equivalence of a complex config object** — one named, checkable
  `expected_effect` per `config-shape` entry, never a spec of the whole feature the shape
  configures.
- **A marker correctly flagged `unreleased` for a version genuinely ahead of the one installed** —
  that is disclosure's job (the inline marker and the generated `llms.txt` banner), not this
  gate's; a `since` later than the installed version is skipped, on purpose, every time.
- **A package with no published version at all yet** (`@narrativetrace/cli`, on its own separate
  Apache-2.0 release line, not lockstep with the BSL runtime family) has no version number the
  `since` exemption can key on — its entries correctly report `fails` until its first publish,
  which is the honest answer to "can this documented behavior be verified against anything
  published right now."

## See also

- [Duplication Detection](duplication.md) — the other ratchet-style gate this repository runs the
  same way: a report every commit, an enforcement task wired into `check`.
- [What to Commit](what-to-commit.md) — how generated/reviewed artifacts are told apart in this
  repository generally.

---

Not translated into es/pt-BR/zh-CN, following this repository's own precedent: `duplication.md`
(the other per-commit gate/tooling doc) carries no translated mirror either — gate documentation is
process/tooling content for contributors, not the product documentation the translation program
covers.
