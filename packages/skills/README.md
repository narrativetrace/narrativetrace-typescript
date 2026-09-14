# @narrativetrace/skills

The typed agent-skills catalogue (`skill-design.md` §4.1): one `Skill` per capability, held to the
full house standard (tested, mutation-checked, reviewed in PRs) and rendered — never hand-edited —
into `.claude/skills/<canonicalName>/SKILL.md`, `.agents/skills/<canonicalName>/SKILL.md`, and the
root `AGENTS.md`'s managed section. A `Skill`'s `canonicalName` (e.g. `narrativetrace-doctor`) is
the ONLY name it ever carries: every platform's directory and every platform's frontmatter `name:`
equal it exactly. A shortened segment is legitimate only inside a plugin whose own prefix carries
the brand — nothing this repository renders is a plugin, so the schema has no such field.

```
src/
├── skill.ts              # the Skill schema, command-vocabulary + replayability lints
├── pro-listing.ts         # the honest Pro-tier listing shape
├── catalogue/
│   ├── narrativetrace-doctor.ts   # diagnosis, read-only
│   ├── add-narrative-tracing.ts   # install and first trace
│   ├── doctor-commands.ts         # shared command/verify strings the two catalogue entries use
│   └── pro-listings.ts            # Pro skills, listed (never their instructions)
├── catalogue-index.ts     # assembly
├── lints.ts               # Tier A: catalogue-wide checks
└── render/
    ├── body.ts            # Skill -> Markdown body, shared by every platform's SKILL.md
    ├── claude.ts          # Skill -> SKILL.md (Claude plugin frontmatter: name/description/
    │                       #   when_to_use/allowed-tools)
    ├── agents-skills.ts    # Skill -> SKILL.md (Codex's `.agents/skills/` layout — frontmatter is
    │                       #   a strict subset: name/description only)
    └── agents-md.ts        # Skill[] -> the AGENTS.md snippet
```

Rendering is a build step: `pnpm run skills-render` writes the artifacts, `pnpm run skills-check`
(wired into `pnpm run check`) fails naming any that drifted from the typed source. Tier A2 (oracle
replay of a skill's own step data against `examples/sixty-seconds`, no LLM) lives in
`__tests__/replay.test.ts`; Tier B (LLM trials) is out of `check`'s scope — see
`documentation/agent-skills.md` for how the owner runs those.

**Why `.agents/skills/` and not `.codex/skills/`**: the Codex CLI's own documented skill
discovery (developers.openai.com/codex/skills,
developers.openai.com/codex/concepts/customization; fetched 2026-09-13) walks from the working
directory up to the repository root looking for `.agents/skills/<name>/SKILL.md` (plus
`~/.agents/skills` for user-global skills) — there is no `.codex/`-prefixed layout. Gemini has no
documented equivalent yet; when one lands, `render/agents-skills.ts` or `render/claude.ts` is the
template to follow (a pure `Skill -> string` function plus a `tools/skills-render.ts` file-path
wiring, drift-checked the same way).
