// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { expect, test } from "vitest";
import { DefaultDataProcessor } from "../src/data-processor.js";
import { DefaultEntityHandler } from "../src/entity-handler.js";
import { DefaultGameManager } from "../src/game-manager.js";
import { DefaultStateManager } from "../src/state-manager.js";
import { DefaultThingFactory } from "../src/thing-factory.js";

function createTracedGameManager() {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const manager = traceObject(
    new DefaultGameManager(
      traceObject(new DefaultDataProcessor(), ctx, undefined, { className: "DataProcessor" }),
      traceObject(new DefaultStateManager(), ctx, undefined, { className: "StateManager" }),
      traceObject(new DefaultThingFactory(), ctx, undefined, { className: "ThingFactory" }),
      traceObject(new DefaultEntityHandler(), ctx, undefined, { className: "EntityHandler" }),
    ),
    ctx,
    undefined,
    { className: "GameManager" },
  );
  return { manager, ctx };
}

test("traced handle produces single root trace node", () => {
  const { manager, ctx } = createTracedGameManager();
  manager.handle("Player1");
  const trace = ctx.captureTrace();
  expect(trace.roots).toHaveLength(1);
});

test("root trace node has GameManager.handle signature", () => {
  const { manager, ctx } = createTracedGameManager();
  manager.handle("Player1");
  const trace = ctx.captureTrace();
  expect(trace.roots[0]?.signature.className).toBe("GameManager");
  expect(trace.roots[0]?.signature.methodName).toBe("handle");
});

test("root trace node has returned outcome", () => {
  const { manager, ctx } = createTracedGameManager();
  manager.handle("Player1");
  const trace = ctx.captureTrace();
  expect(trace.roots[0]?.outcome.kind).toBe("returned");
});

test("traced handle has four child service calls", () => {
  const { manager, ctx } = createTracedGameManager();
  manager.handle("Player1");
  const trace = ctx.captureTrace();
  const classNames = trace.roots[0]?.children.map((c) => c.signature.className);
  expect(classNames).toContain("DataProcessor");
  expect(classNames).toContain("StateManager");
  expect(classNames).toContain("ThingFactory");
  expect(classNames).toContain("EntityHandler");
});

test("renderIndentedText produces output containing GameManager", () => {
  const { manager, ctx } = createTracedGameManager();
  manager.handle("Player1");
  const trace = ctx.captureTrace();
  const output = renderIndentedText(trace);
  expect(output.length).toBeGreaterThan(0);
  expect(output).toContain("GameManager");
});
