# Fixture: empty-project

The `add-narrative-tracing` happy-path case's fixture: a directory with nothing in it but a plain
`package.json` (no `"type": "module"` yet, no NarrativeTrace packages) — the "before you start"
state the README's Quick Start and llms.txt's "Install and first trace" both assume, so the case
actually exercises the trap (set `type: module` before `npm add`, or step 2 throws) rather than
starting from an already-correct project.
