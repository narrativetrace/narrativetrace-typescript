# @narrativetrace/diagrams

Render a captured NarrativeTrace tree as a Mermaid or PlantUML sequence diagram.

## Install

```bash
pnpm add @narrativetrace/diagrams @narrativetrace/core
```

`@narrativetrace/core` is a peer dependency.

## Usage

`renderMermaidSequence` and `renderPlantUmlSequence` both take a `TraceTree`
(from `context.captureTrace()`) and return diagram source as a string.

```ts
import { NarrativeTraceConfig, SyncNarrativeContext } from '@narrativetrace/core';
import { traceObject } from '@narrativetrace/proxy';
import { renderMermaidSequence, renderPlantUmlSequence } from '@narrativetrace/diagrams';

const context = new SyncNarrativeContext(new NarrativeTraceConfig());
traceObject(orderService, context).placeOrder('C1', 'P1', 2);

const tree = context.captureTrace();

const mermaid = renderMermaidSequence(tree);   // -> "sequenceDiagram\n  participant ..."
const plantuml = renderPlantUmlSequence(tree); // -> "@startuml\n..."
```

The `DiagramFormat` type (`"mermaid" | "plantuml"`) is exported for callers
that switch renderers by name.

## Learn more

- [NarrativeTrace README](../../README.md) — the trace model, packages, and quick start.
