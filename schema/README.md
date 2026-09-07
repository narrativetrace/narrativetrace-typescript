# Schemas

Two kinds of file live here, and they have different golden sources. The
**output schemas** below are copied down from Java. `skill.schema.json` is
**authored in this repository** — see the last section.

## Canonical output schemas

The normative JSON Schemas for NarrativeTrace's machine-readable output, copied
verbatim from the Java reference
(`narrativetrace-core/src/test/resources/schema/`), which is the golden source
for the format. **Do not edit them here** — a change is a cross-port contract
change and is made in the Java repository first, then copied down.

| File | Validates | Version |
|---|---|---|
| `entry.schema.json` | one atomic event: the records in a `.canonical.json` artifact | `nt.schemaVersion` `1.2` |
| `chapter.schema.json` | one completed trace as a log-shaped record (`exportChapter`) | `nt.schemaVersion` `1.2` |
| `chapter-tree.schema.json` | the nested trace envelope (`exportJson`, and the `nt.chapterTree` payload inside a chapter) | envelope `version` `1.0` |

The envelope `version` and `nt.schemaVersion` are **different fields on
different documents** and move independently: `nt.schemaVersion` reached 1.2 on
2026-08-18 while the chapter-tree envelope is still 1.0.

Two outcome vocabularies coexist, and both are deliberate:

- `nt.outcome` on entries and chapters is OTel-facing — `success` / `failure` /
  `incomplete` (entries) and `success` / `failure` / `partial` (chapters).
- `outcome` on the events inside a chapter tree is the capture model's own word —
  `returned` / `threw` / `incomplete`.

`__tests__/canonical-schema-conformance.test.ts` validates the bytes
`writeTraceOutput` actually produces against these files, rather than hand-built
input — the Java reference hid three defects behind a suite that validated only
what its tests constructed.

These schema files are licensed under the [Apache License, Version 2.0](../LICENSE-APACHE) as
part of the open output-format specification, unlike the runtime that produces them (see the
root [`LICENSE`](../LICENSE)).

## Skill frontmatter — authored here

| File | Validates | Golden source |
|---|---|---|
| `skill.schema.json` | the YAML frontmatter of a `SKILL.md` in the skills catalogue | **this repository** |

The skills catalogue is **TypeScript first** (vision v16.3, *One Prompt Per
Capability*): the vibe-coding platforms it targets live on the TypeScript stack,
so this port carries the format first and Java, Python and .NET mirror it. That
inverts the usual direction — edit this file here, then propagate. It is not a
copy of anything, and the "do not edit" rule above does not apply to it.

`name` and `description` are the [Agent Skills open
standard](https://agentskills.io)'s own fields (the standard's own limits, 64
and 1024 characters, are pinned here); everything NarrativeTrace adds lives
under `metadata`, which the standard leaves free-form. Top-level additional
properties are therefore **allowed** — the standard owns that namespace and may
add to it — while `metadata` is **closed**, because NarrativeTrace owns it and
an unrecognized key there is a typo, not an extension.

`packages/skills/__tests__/skill-schema-conformance.test.ts` validates the text
the renderer produces, parsed as YAML the way an agent's loader parses it, with
one negative control per constraint.

It is licensed under the same [Apache License, Version 2.0](../LICENSE-APACHE) as the output
schemas, for the same reason: the skill format is an open standard's profile, not the runtime.
