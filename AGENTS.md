<!-- narrativetrace:skills:start -->
## NarrativeTrace agent skills

- `narrativetrace-doctor` — Diagnoses a NarrativeTrace TypeScript install and configuration. Use when nothing is being traced, traces aren't showing up, the vitest config crashes on load, parameter names render as arg0/arg1, or you are not sure NarrativeTrace is wired up correctly. Checks Node/vitest-peer/sibling-package versions, the /reporters subpath, traceObject option shapes, NARRATIVETRACE_OUTPUT, whether any consumer is attached to a traced proxy, whether redaction is proven in a test, and stale approval-trace diffs. Read-only — makes no changes. Say 'check my narrativetrace setup', 'is narrativetrace broken', or 'why isn't anything being traced' to invoke it.
- `add-narrative-tracing` — Installs NarrativeTrace into a TypeScript project and gets it to a first trace. Use when NarrativeTrace is not yet installed, a project needs its very first traced call, or traces need to reach a real logger instead of a bare console.log. Installs @narrativetrace/core-node and @narrativetrace/proxy with the project's real package manager, wraps a class with traceObject, renders and runs the first trace, then wires a pino/winston/OpenTelemetry-style consumer so traces reach your logger. Ends by running narrativetrace doctor to confirm the install is correctly wired — narrativetrace-doctor owns diagnosis from there. Say 'add narrative tracing to my service', 'install narrativetrace', 'get a trace in 60 seconds', 'wrap this class so I can see a trace', or 'send my traces to my logger' to invoke it.
- `narrativetrace-pro-aggregate` (Pro, shipped) — aggregated trees, hotspots, and method/error frequencies via @narrativetrace/pro-aggregate's EventAggregator
- `narrativetrace-mcp` (Pro, in development) — a stdio MCP server, connecting Claude Code / Cursor directly to captured traces

See llms.txt for the full doc index.
<!-- narrativetrace:skills:end -->
