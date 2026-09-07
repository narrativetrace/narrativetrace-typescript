// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { DefaultDataProcessor } from "./data-processor.js";
import { DefaultEntityHandler } from "./entity-handler.js";
import { DefaultGameManager, type GameManager } from "./game-manager.js";
import type { NarrativeContext, Scenario, ScenarioContext } from "./scenario.js";
import { DefaultStateManager } from "./state-manager.js";
import { DefaultThingFactory } from "./thing-factory.js";

/**
 * The unrefactored half of Java's minecraft example: byte for byte the wiring of the refactored
 * one — only the vocabulary differs, and that is the whole point.
 */
export function createTracedGameManager(context: NarrativeContext): GameManager {
  const trace = <T extends object>(target: T, className: string, names: Record<string, string[]>) =>
    traceObject(target, context, names, { className });
  return trace(
    new DefaultGameManager(
      trace(new DefaultDataProcessor(), "DataProcessor", { process: ["a", "b"] }),
      trace(new DefaultStateManager(), "StateManager", { update: ["item", "quantity"] }),
      trace(new DefaultThingFactory(), "ThingFactory", { create: ["recipe"] }),
      trace(new DefaultEntityHandler(), "EntityHandler", { execute: ["kind", "a", "b", "c"] }),
    ),
    "GameManager",
    { handle: ["input"] },
  );
}

function section(ctx: ScenarioContext, title: string, body: string): void {
  ctx.print(`\n--- ${title} ---\n`);
  ctx.print(body);
}

const playerJoinsWorld: Scenario = {
  title: "Unrefactored: Player Joins World",
  wiring:
    "Wiring: byte for byte the setup of the refactored half — same traceObject calls, same\n" +
    "paramNames maps, same pipeline. Only the class and method names differ, and a tracer can\n" +
    "only report what the code calls itself: generic names in, generic trace out.",
  run: async (ctx) => {
    ctx.print("  Generic names — same behavior, but the trace tells you nothing.\n");
    createTracedGameManager(ctx.context).handle("Steve");
    const tree = ctx.context.captureTrace();
    ctx.capture(playerJoinsWorld.title, tree);
    section(ctx, "Trace tree", renderIndentedText(tree));
  },
};

export const scenarios: readonly Scenario[] = [playerJoinsWorld];
