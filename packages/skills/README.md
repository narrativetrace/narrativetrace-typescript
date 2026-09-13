# @narrativetrace/skills

The typed agent-skills catalogue (`skill-design.md` §4.1): one `Skill` per capability, held to the
full house standard (tested, mutation-checked, reviewed in PRs) and rendered — never hand-edited —
into `.claude/skills/<segment>/SKILL.md` and the root `AGENTS.md`'s managed section.

```
src/
├── skill.ts              # the Skill schema, command-vocabulary + replayability lints
├── pro-listing.ts         # the honest Pro-tier listing shape
├── catalogue/
│   ├── narrativetrace-doctor.ts   # the one skill shipped so far
│   └── pro-listings.ts            # Pro skills, listed (never their instructions)
├── catalogue-index.ts     # assembly
├── lints.ts               # Tier A: catalogue-wide checks
└── render/
    ├── claude.ts          # Skill -> SKILL.md (Claude plugin layout)
    └── agents-md.ts        # Skill[] -> the AGENTS.md snippet
```

Rendering is a build step: `pnpm run skills-render` writes the artifacts, `pnpm run skills-check`
(wired into `pnpm run check`) fails naming any that drifted from the typed source. Tier A2 (oracle
replay of a skill's own step data against `examples/sixty-seconds`, no LLM) lives in
`__tests__/replay.test.ts`; Tier B (LLM trials) is out of `check`'s scope — see
`documentation/agent-skills.md` for how the owner runs those.
