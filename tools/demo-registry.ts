// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The launcher's view of an example: the structural shape every `examples/<name>/src/scenarios`
 * module exports. Declared here, not imported from an example, so the launcher never couples the
 * examples to each other and consumes them structurally (the plain-JS one has no types to import).
 *
 * The example builds its context and trees with its own copy of `@narrativetrace/core` (the
 * package's `dist`), whose `SpanId`/`TraceId` brands are `unique symbol`s — a second declaration
 * of the same types, which the launcher's source-imported types can never structurally match. The
 * launcher therefore holds them as opaque handles: it only ever `reset()`s the context and hands
 * trees back to `exportJson`, and each loader casts once, where this comment explains why.
 */
export interface ExampleContext {
  reset(): void;
}

/** A captured trace tree, built by the example's copy of core; see the module note. */
export type ExampleTree = object;

/** A live listener the launcher supplies; typed on `never` so any consumer is accepted. */
export type LiveListener = (event: never) => void;

export interface ScenarioContext {
  readonly context: ExampleContext;
  readonly print: (text: string) => void;
  readonly capture: (title: string, tree: ExampleTree) => void;
}

export interface Scenario {
  readonly title: string;
  readonly wiring: string;
  readonly run: (ctx: ScenarioContext) => Promise<void>;
}

export interface LoadedExample {
  readonly name: ExampleName;
  readonly scenarios: readonly Scenario[];
  readonly createDemoContext: (listener: LiveListener | null) => ExampleContext;
  /** Repository-relative path of the example's committed `glossary.json`. */
  readonly glossaryPath: string;
  /** Source prefix the glossary's bounded context declares; every class resolves to it. */
  readonly sourcePrefix: string;
}

/** Picker order — the suggested reading order, ecommerce first. */
export const EXAMPLE_NAMES = ["ecommerce", "clarity", "minecraft", "plain-js"] as const;

export type ExampleName = (typeof EXAMPLE_NAMES)[number];

export function isExampleName(candidate: string): candidate is ExampleName {
  return (EXAMPLE_NAMES as readonly string[]).includes(candidate);
}

/** The `--list` output: one name per line, picker order. */
export function formatExampleList(): string {
  return EXAMPLE_NAMES.join("\n");
}

type ScenarioModule = Pick<LoadedExample, "scenarios" | "createDemoContext">;

/** The one cast per example: same runtime shape, a second declaration of the branded types. */
function asModule(module: unknown): ScenarioModule {
  return module as ScenarioModule;
}

type Loader = () => Promise<ScenarioModule>;

/**
 * Static import map (no template-literal `import()`, which bundlers and vitest cannot resolve).
 * `minecraft` shows both halves of Java's one example: refactored first, unrefactored right after.
 */
const LOADERS: Record<ExampleName, Loader> = {
  ecommerce: async () => {
    const { scenarios } = await import("../examples/ecommerce/src/scenarios.js");
    const { createDemoContext } = await import("../examples/ecommerce/src/scenario.js");
    return asModule({ scenarios, createDemoContext });
  },
  clarity: async () => {
    const { scenarios } = await import("../examples/clarity/src/scenarios.js");
    const { createDemoContext } = await import("../examples/clarity/src/scenario.js");
    return asModule({ scenarios, createDemoContext });
  },
  minecraft: async () => {
    const refactored = await import("../examples/minecraft/src/scenarios.js");
    const generic = await import("../examples/minecraft-generic/src/scenarios.js");
    const { createDemoContext } = await import("../examples/minecraft/src/scenario.js");
    const scenarios = [...refactored.scenarios, ...generic.scenarios];
    return asModule({ scenarios, createDemoContext });
  },
  "plain-js": async () => asModule(await import("../examples/plain-js/src/scenarios.mjs")),
};

export async function loadExample(name: ExampleName): Promise<LoadedExample> {
  const { scenarios, createDemoContext } = await LOADERS[name]();
  return {
    name,
    scenarios,
    createDemoContext,
    glossaryPath: `examples/${name}/glossary.json`,
    sourcePrefix: `examples/${name}/src`,
  };
}
