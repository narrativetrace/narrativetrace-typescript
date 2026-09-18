# NarrativeTrace TypeScript FAQ

Answers to the questions that come up once NarrativeTrace is actually wired into a project — not
"what does this do" (the [Installation Guide](installation-guide.md) and
[Configuration Guide](configuration-guide.md) cover that) but "why is it behaving this way."

## Two dials, two paths

**Q: I set the tracing level to `detail` but nothing shows up in my logs. Or: I set the logger to
`warn` and the trace still appears in my test output. Which setting wins?**

Both, because they answer different questions. NarrativeTrace has two dials, and its pipeline has
two paths.

**Dial 1, the tracing level, decides what is captured.** `off`, `errors`, `summary`, `narrative`,
`detail`, in increasing order of verbosity — `isEnabled(current, required)` in `@narrativetrace/core`
compares them in that order. It is NarrativeTrace's own setting, and `off` is the one value that
sits in front of capture altogether: a call made while the level is `off` is never intercepted, so
it never becomes an event and no other setting can bring it back. `errors`, `summary` and
`narrative` still intercept and publish every call — they narrow what `captureTrace()`'s tree keeps
afterward (only the paths that threw, root-plus-deepest-leaf, no parameter values) rather than
skipping capture up front. `off` is therefore also the only level that changes the interception
cost of tracing; the other three still pay to intercept and publish every call, then prune what
comes back.

**Dial 2, your logger's level, decides what is printed.** NarrativeTrace writes every captured
event to the `Logger` instance you hand `createPinoEventConsumer`/`createWinstonEventConsumer`, as
a log line, at a level per kind of line: an entry and a return default to `trace` in
`@narrativetrace/pino` (pino has a real TRACE level) and to `debug` in `@narrativetrace/winston`
(winston's closest analog); an exception defaults to `warn` in both, so a handled-and-narrated
failure never masquerades as an unhandled logger error. Your logger's own threshold then does what
it always does. Raising it silences lines. It never captures more, and it never captures less.

**Now the two paths, which is where the confusion comes from.** Every captured event travels down
both paths of the default `DualPathPipeline` at once:

- The **synchronous path** runs the logger listener — the function
  `createPinoEventConsumer`/`createWinstonEventConsumer` returns — inline, before the traced method
  continues. The log line is written before the call returns, so it survives a crash. This is the
  only path your logger's level affects.
- The **buffered path** feeds everything else: `captureTrace()`, the trace files
  `createNarrativeTest` writes after a test, approval traces, the clarity report,
  `@narrativetrace/opentelemetry`'s export, the rendered narrative
  (`renderMarkdown()`/`renderProse()`/`renderIndentedText()`). This path never consults your
  logger. It sees every event the tracing level admitted, whatever the logger threshold says.

So a logger at `warn` and a tracing level at `detail` gives you quiet logs and a complete trace
file. A tracing level at `summary` and a logger left at its most verbose setting (`trace` in pino,
`debug` in winston) gives you a loud log of a thin trace. And a tracing level at `off` gives you
nothing anywhere, because nothing was captured.

**Where each dial lives.**

| Dial | Where it lives |
|---|---|
| Tracing level | `NARRATIVETRACE_LEVEL` env var, the `"level"` key in `narrativetrace.config.json`/`.narrativetracerc.json`, or the `NarrativeTraceConfig` constructor / `config.level` setter in code — highest precedence first: code, then env var, then config file (see [Where settings come from](configuration-guide.md#2b-where-settings-come-from)) |
| Logger threshold | Your logger's own config — pino's `level` option, winston's `level` option — set on the `Logger` instance you construct yourself. NarrativeTrace writes to that instance directly; it owns no logger name of its own, so there is nothing extra to configure to find it |
| Level per kind of line | The `levels` option of `createPinoEventConsumer(logger, { levels })` / `createWinstonEventConsumer(logger, { levels })`, keyed `enter` / `return` / `exception` (see [Per-event levels](framework-integration-guide.md#per-event-levels)) |

**Rules of thumb.** To reduce log volume, raise the logger threshold; the trace file is untouched.
To reduce the size of the trace, lower the tracing level. To reduce overhead, lower the tracing
level; the logger threshold changes nothing about cost. To keep tracing on in production but out
of the logs, leave the tracing level at `summary` and the logger at `warn`: the synchronous path
stays quiet and the buffered path still feeds your exports.

## See also

- [Configuration Guide § Two dials, two paths](configuration-guide.md#9-two-dials-two-paths) —
  the same explanation alongside the rest of the settings reference
- [Framework Integration Guide § Per-event levels](framework-integration-guide.md#per-event-levels)
  — the `levels` option in full, for both consumers
- [Troubleshooting](troubleshooting.md) — symptom → cause → fix for the failure modes people
  actually hit
