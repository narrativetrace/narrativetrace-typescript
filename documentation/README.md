# NarrativeTrace documentation

[English](README.md) | [Español](LEAME.md) | [Português](LEIAME.md) | [简体中文](自述文件.md)

The canonical index of every user guide, English and translated alike. See the root
[README](../README.md) for the product pitch; this page is the documentation set on its own.
Translated indexes appear here once a language ships one (`documentation/i18n/manifest.json` tracks
progress; the translation platform's conventions govern how each stays in sync).

Start here:

- [See a trace in 60 seconds](first-10-minutes.md) — a plain script wraps one service, one run, the trace in your terminal
- [Installation Guide](installation-guide.md) — dependencies, every integration path, trace output setup
- [Choosing an Integration](choosing-an-integration.md) — which package you need, as a decision diagram
- [Configuration Guide](configuration-guide.md) — tracing levels, Vitest config, render options
- [Decorators Guide](decorators-guide.md) — `@traced`, `@narrated`, `@onError`, `@notTraced`

Going deeper:

- [Privacy and Redaction](privacy-and-redaction.md) — the row-by-row redaction contract, verified against the code
- [What to Commit](what-to-commit.md) — which generated files are run output and which (if any) are reviewed baselines
- [Troubleshooting](troubleshooting.md) — symptom → cause → fix for the failure modes people actually hit
- [Clarity Guide](clarity-guide.md) — scoring model, NLP components, static scanner
- [Framework Integration Guide](framework-integration-guide.md) — Express, Hono, browser, AsyncLocalStorage
- [Examples Guide](examples-guide.md) — the `pnpm demo` launcher and the runnable examples
- [Feature Guide](feature-guide.md) — canonical catalog of what this runtime ships, with tier and status
