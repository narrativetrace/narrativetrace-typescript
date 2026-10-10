// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  type Evidence,
  type FrameworkRow,
  frameworkRow,
  type IntegrationModule,
  type Marker,
  NO_TIER_B_CASE,
  type Wiring,
} from "./framework-row.js";

/**
 * The framework table — Phase 6's D1: ONE registry of which frameworks NarrativeTrace integrates
 * with in TypeScript, how a project proves it uses one, which packages it adds, how they are
 * wired, and which doctor check watches the wiring.
 *
 * INTENT: the table ships inside the library the doctor runs from, so a project is measured
 * against the rows of the NarrativeTrace version it actually installed — never against the
 * repository or the live docs, which describe the newest release. The `add-narrative-tracing`
 * skill lists no framework: it runs the doctor and applies every `config.<framework>-*` fix it
 * prints. `llms-full.md`'s framework table and `llms.txt`'s covered-frameworks line render from
 * these rows.
 *
 * @llmNote Adding a framework is adding a row here and, when its wiring is source-level, a compiled
 * fixture with a proving test plus `pnpm run framework-table-render`: the doctor check, the docs and
 * the skill follow without new code. Ids are a cross-port contract — append, never rename.
 */

const SCOPE = "@narrativetrace/";

/** The package's own name as a quoted import or require specifier, never a longer sibling's. */
export function importOf(packageName: string): RegExp {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`["']${escaped}["']`);
}

/** A call of `name`: the identifier, optional whitespace, an opening parenthesis. */
function call(name: string): RegExp {
  return new RegExp(`\\b${name}\\s*\\(`);
}

function evidence(...allOf: RegExp[]): Evidence {
  return { allOf };
}

function snippet(
  description: string,
  fixture: string,
  language: string,
  ...items: Evidence[]
): Wiring {
  return { kind: "snippet", description, fixture, language, evidence: items };
}

function marker(description: string, ...packages: string[]): Marker {
  return { description, packages, deferTo: [] };
}

function nt(name: string): string {
  return `${SCOPE}${name}`;
}

function module(packages: string[], dev = false): IntegrationModule {
  return { packages, dev };
}

const PINO_FIXTURE = "packages/pino/__tests__/wiring/narrative-pipeline.ts";
const PINO_WIRING = snippet(
  "a pipeline built from this project's pino logger, passed to its narrative context",
  PINO_FIXTURE,
  "ts",
  evidence(importOf(nt("pino")), call("createPinoEventConsumer")),
);
const PINO_PACKAGES = [nt("pino"), nt("core"), nt("observability")];

function vitest(): FrameworkRow {
  return {
    id: "vitest",
    name: "Vitest",
    marker: marker("a vitest dependency", "vitest"),
    module: module([nt("vitest"), nt("proxy")], true),
    wiring: snippet(
      "a test built with `createNarrativeTest()`, or a NarrativeTrace reporter in `vitest.config`",
      "packages/vitest/__tests__/wiring/order-service.test.ts",
      "ts",
      evidence(importOf(nt("vitest")), call("(?:createNarrativeTest|narrativeTest)")),
      evidence(importOf(nt("vitest/reporters"))),
    ),
    check: { kind: "wiring-check", id: "config.vitest-fixture" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function express(): FrameworkRow {
  return {
    id: "express",
    name: "Express",
    marker: marker("an express dependency", "express"),
    module: module([nt("express"), nt("core"), nt("core-node"), nt("observability")]),
    wiring: snippet(
      "`app.use(narrativeTrace(…))` before the routes, printing each request's trace",
      "packages/express/__tests__/wiring/narrative-trace.ts",
      "ts",
      evidence(importOf(nt("express")), call("narrativeTrace")),
    ),
    check: { kind: "wiring-check", id: "config.express-middleware" },
    tierBCase: "init-prompt-express-project",
  };
}

function hono(): FrameworkRow {
  return {
    id: "hono",
    name: "Hono",
    marker: marker("a hono dependency", "hono"),
    module: module([nt("hono"), nt("core"), nt("core-node"), nt("observability")]),
    wiring: snippet(
      '`app.use("*", narrativeTrace(…))` before the routes, printing each request\'s trace',
      "packages/hono/__tests__/wiring/narrative-trace.ts",
      "ts",
      evidence(importOf(nt("hono")), call("narrativeTrace")),
    ),
    check: { kind: "wiring-check", id: "config.hono-middleware" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function nestjs(): FrameworkRow {
  return {
    id: "nestjs",
    name: "NestJS",
    marker: marker("an @nestjs/core dependency", "@nestjs/core"),
    module: module([nt("nestjs"), nt("core"), nt("core-node"), nt("observability")]),
    wiring: snippet(
      "`AutoProxyModule.forRoot({ onRequestComplete })` in the root module's imports",
      "packages/nestjs/__tests__/wiring/narrative-trace.module.ts",
      "ts",
      evidence(importOf(nt("nestjs")), /\bAutoProxyModule\s*\.\s*forRoot\s*\(/),
    ),
    check: { kind: "wiring-check", id: "config.nestjs-module" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function angular(): FrameworkRow {
  return {
    id: "angular",
    name: "Angular",
    marker: marker("an @angular/core dependency", "@angular/core"),
    module: module([nt("angular"), nt("core"), nt("proxy")]),
    wiring: snippet(
      "`provideNarrativeTrace()` in the application config's providers",
      "packages/angular/__tests__/wiring/app.config.ts",
      "ts",
      evidence(importOf(nt("angular")), call("provideNarrativeTrace")),
    ),
    check: { kind: "wiring-check", id: "config.angular-provider" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function react(): FrameworkRow {
  return {
    id: "react",
    name: "React",
    marker: marker("a react dependency", "react"),
    module: module([nt("react"), nt("core"), nt("core-web"), nt("proxy")]),
    wiring: snippet(
      "`<NarrativeTraceProvider>` around the app",
      "packages/react/__tests__/wiring/root.tsx",
      "tsx",
      evidence(importOf(nt("react")), /<NarrativeTraceProvider\b/),
    ),
    check: { kind: "wiring-check", id: "config.react-provider" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function reactRouter(): FrameworkRow {
  return {
    id: "react-router",
    name: "React Router",
    marker: marker(
      "a react-router or react-router-dom dependency",
      "react-router",
      "react-router-dom",
    ),
    module: module([nt("react-router"), nt("react"), nt("core")]),
    wiring: snippet(
      "a component calling `useNavigationCapture(…)`, rendered inside the router and the provider",
      "packages/react-router/__tests__/wiring/navigation-tracer.tsx",
      "tsx",
      evidence(importOf(nt("react-router")), call("useNavigationCapture")),
    ),
    check: { kind: "wiring-check", id: "config.react-router-capture" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function pino(): FrameworkRow {
  return {
    id: "pino",
    name: "Pino",
    marker: marker("a pino dependency", "pino"),
    module: module(PINO_PACKAGES),
    wiring: PINO_WIRING,
    check: { kind: "wiring-check", id: "config.pino-consumer" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function winston(): FrameworkRow {
  return {
    id: "winston",
    name: "Winston",
    marker: marker("a winston dependency", "winston"),
    module: module([nt("winston"), nt("core"), nt("observability")]),
    wiring: snippet(
      "a pipeline built from this project's winston logger, passed to its narrative context",
      "packages/winston/__tests__/wiring/narrative-pipeline.ts",
      "ts",
      evidence(importOf(nt("winston")), call("createWinstonEventConsumer")),
    ),
    check: { kind: "wiring-check", id: "config.winston-consumer" },
    tierBCase: NO_TIER_B_CASE,
  };
}

const OTEL = importOf(nt("opentelemetry"));

function opentelemetry(): FrameworkRow {
  return {
    id: "opentelemetry",
    name: "OpenTelemetry",
    marker: marker("an @opentelemetry/api dependency", "@opentelemetry/api"),
    module: module([nt("opentelemetry"), nt("core")]),
    wiring: snippet(
      "a pipeline built from this project's tracer, passed to its narrative context",
      "packages/opentelemetry/__tests__/wiring/narrative-pipeline.ts",
      "ts",
      evidence(OTEL, call("createOtelEventConsumer")),
      evidence(OTEL, /\bnew\s+TraceSpanExporter\s*\(/),
    ),
    check: { kind: "wiring-check", id: "config.opentelemetry-consumer" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function defaultLogger(): FrameworkRow {
  return {
    id: "default-logger",
    name: "Default logger (Pino)",
    marker: marker("no logger: none of pino, winston or @opentelemetry/api is declared"),
    module: module([...PINO_PACKAGES, "pino"]),
    wiring: PINO_WIRING,
    check: { kind: "existing-check", id: "trap.silent-sink" },
    tierBCase: NO_TIER_B_CASE,
  };
}

function noIntegration(id: string, name: string, packageName: string): FrameworkRow {
  return {
    id,
    name,
    marker: marker(`a ${packageName} dependency`, packageName),
    module: null,
    wiring: { kind: "none", description: "no NarrativeTrace integration is shipped for it" },
    check: { kind: "no-integration", id: `config.${id}-integration` },
    tierBCase: NO_TIER_B_CASE,
  };
}

/** Every row, in the order the doctor runs their checks and the docs list them. */
export const FRAMEWORK_ROWS: readonly FrameworkRow[] = [
  vitest(),
  express(),
  hono(),
  nestjs(),
  angular(),
  react(),
  reactRouter(),
  pino(),
  winston(),
  opentelemetry(),
  defaultLogger(),
  noIntegration("fastify", "Fastify", "fastify"),
  noIntegration("koa", "Koa", "koa"),
].map(frameworkRow);

/** The row with this id, or `undefined`. */
export function frameworkRowById(id: string): FrameworkRow | undefined {
  return FRAMEWORK_ROWS.find((row) => row.id === id);
}

/**
 * The ids of every check the table adds to the doctor — `config.<framework>-*`, wiring and
 * no-integration alike — in table order. A row bound to an existing check adds none.
 */
export function frameworkCheckIds(): readonly string[] {
  return FRAMEWORK_ROWS.filter((row) => row.check.kind !== "existing-check").map(
    (row) => row.check.id,
  );
}
