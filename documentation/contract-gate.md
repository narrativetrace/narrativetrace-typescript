# The contract gate

`documentation/contract.yaml` is a machine-readable list of claims this repository's
documentation makes — a default, an entry point, a config shape, or the effect a documented shape
produces. `contract-probe/` proves or disproves each one against a **published** install (the real
npm registry, never `workspace:`/`link:`/`file:`), so a doc page and the tarball someone actually
`npm install`ed can never quietly disagree without a gate noticing.

Every document in this repository describes the code it is committed with, and names no version
of its own. The contract gate is what makes that assumption checkable rather than hopeful: the
contract **describes the code on `main`, which is the published code** — development is
trunk-based and publishing is one step, the public snapshot and the packages going out from the
same commit — so "the docs describe what shipped" is a statement something can fail on.

## What it catches

Four kinds of claim, each checked a different way:

| `kind` | What it proves | Example |
|---|---|---|
| `entry-point` | A package resolves at all, on the real npm registry, at the version under test | `@narrativetrace/core` |
| `reflectable-default` | The published `package.json` already says what the docs claim — no execution needed | `@narrativetrace/core`'s `engines.node` is `>=20` |
| `probed-default` | A default only visible at runtime (an env var's effect, a redaction decision) | `NARRATIVETRACE_OUTPUT` defaults to `true` |
| `config-shape` | A documented configuration shape produces the effect the docs claim | `@narrativetrace/vitest/reporters` is an importable subpath |

No entry carries a version of its own, and none is ever skipped. `contract-check` resolves the
version to probe, installs that version's artifacts, and reads `documentation/contract.yaml`
**from the working tree** — the claims the gate reads and the install it probes are the same code,
so every claim applies.

## Two gates, two cadences

- **`pnpm run contract-lint`** — part of `pnpm run check`, every commit, no network. Validates
  `documentation/contract.yaml` itself: the schema parses, no two entries make the same claim,
  every entry's `probe` file exists, and every `page#anchor` pointer resolves to a heading that
  actually exists on that page.
- **`pnpm run contract-check`** — nightly, registry-backed, never per commit (the same
  "no network in the per-commit gate" rule the security scanners follow). Resolves the version to
  check the way `tools/verify-publication.ts` does (the newest `v*` tag reachable from HEAD, else
  npm's own `latest` dist-tag for `@narrativetrace/core`), installs it into a **fresh temp
  directory with a fresh npm cache** — never this checkout's own `node_modules`, never a
  `workspace:`/`link:`/`file:` reference standing in for the real answer — and runs
  `contract-probe/run.ts` against it. Exits non-zero on any `fails`.

Run the nightly gate by hand against a specific version:

```bash
pnpm run contract-check <published-version>   # install and probe that published version
pnpm run contract-check                       # omit it: checks the last published one
pnpm run contract-check -- --dry-run
```

A failure names every fact in one line, so a skim is enough:

```
documentation/contract.yaml: probed-narrativetrace-output-default documented default "true"
but probed-narrativetrace-output-default <published-version> (published) reads "false"
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
    --version <published-version> --cwd /path/to/an/npm-installed/scratch/project \
    --out /tmp/contract-result.json
```

`--contract` is a path, not a fixed file, which is the low-level escape hatch for developing a
probe against any copy of the contract. `tools/contract-check.ts` is the gate, and it points the
same script at the same working-tree file, plus the fresh-install isolation described above.

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

1. Write the sentence in the doc page first, in the present tense — the page describes the code
   it is committed with, so it names no version.
2. Add the entry to `documentation/contract.yaml`: `id`, `kind`, `page` (the doc path and the
   anchor of the heading carrying the sentence), `claim`,
   `documented_default`/`expected_effect`, and `probe`.
3. Write the probe under `contract-probe/probes/<id>.mjs`. Use only the package's stable public
   API: the probe runs against the published artifact, so it may assume exactly the API the
   release carries and nothing newer.
4. `pnpm run contract-lint` — confirms the shape and the anchor.
5. `pnpm run contract-check` — runs your new entry against today's published artifact. Expect a
   `fails` line until the release carrying the feature goes out; that is the entry telling you it
   is ahead of the release, not a defect. Land the entry with the feature and let the release
   close it.

## What this deliberately does not cover

- **Prose accuracy outside `contract.yaml`.** A documented explanation that is simply wrong,
  incomplete, or confusing is a different failure mode — review catches that, not a runtime probe.
- **Anything the sixty-seconds tutorial's own proof already owns** (`tools/verify-publication-smoke.ts`)
  — `contract.yaml` is for defaults and shapes documented elsewhere, not a second copy of that
  page's own proof.
- **Full behavioral equivalence of a complex config object** — one named, checkable
  `expected_effect` per `config-shape` entry, never a spec of the whole feature the shape
  configures.
- **The short window between a commit and the release that publishes it.** `main` and the
  published packages are the same code, published together, so there is no standing gap to model
  — but while a release is still in flight, a claim that landed with its feature is read against
  the previous artifact and says `fails`. That is the gate naming an unpublished commit, not a
  defect it is judging, and the release closes it.
- **A package with no published version at all yet** (`@narrativetrace/cli`, on its own separate
  Apache-2.0 release line, not lockstep with the BSL runtime family) — its entries correctly
  report `fails` until its first publish, which is the honest answer to "can this documented
  behavior be verified against anything published right now."

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
