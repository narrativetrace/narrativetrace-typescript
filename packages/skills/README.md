# @narrativetrace/skills

The published skills carrier: `narrativetrace-doctor` and `add-narrative-tracing` as resources —
one `SKILL.md` per platform (`agents/`, `claude/`) plus a versionless `catalogue.json`. No code —
what an installer reads out of this package is text. The typed catalogue that renders it (the
schema, the lints, the eval harness) lives in the private `@narrativetrace/skills-catalogue`;
`pnpm run skills-render` there writes every file under this package as one more render target,
and `pnpm run skills-check` (wired into `pnpm run check`) fails the build the moment a page here
drifts from the typed source.

```
agents/
├── narrativetrace-doctor/SKILL.md
└── add-narrative-tracing/SKILL.md
claude/
├── narrativetrace-doctor/SKILL.md
└── add-narrative-tracing/SKILL.md
catalogue.json
```

`agents/` is Codex's own discovered `.agents/skills/` layout; `claude/` is Claude's plugin
layout — the two directories hold the same two skills with different frontmatter, never a
rendering choice made by whatever reads this package. `catalogue.json` names every skill once
(`{name, description, agents, claude}`) with no version literal: the stamp is this package's own
`package.json` version, read by whatever consumes the carrier, so a copy can never go stale
independently of the package it shipped in.

`@narrativetrace/cli` bundles a byte-identical copy of this package's contents under
`skills/` so `npx @narrativetrace/cli init` works offline from the one package a consumer
already fetched — the same content, two homes, checked byte-for-byte against each other.

Licensed Apache 2.0 — like `@narrativetrace/cli`, and unlike the Business Source License 1.1
runtime packages published from this repository (see `LICENSE`).
