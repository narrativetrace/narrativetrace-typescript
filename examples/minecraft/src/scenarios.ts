// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core-node";
import { renderMermaidSequence, renderPlantUmlSequence } from "@narrativetrace/diagrams";
import { traceObject } from "@narrativetrace/proxy";
import { DefaultCraftingTable } from "./crafting-table.js";
import { DefaultCreatureSpawner } from "./creature-spawner.js";
import { DefaultPlayerInventory } from "./player-inventory.js";
import type { NarrativeContext, Scenario, ScenarioContext } from "./scenario.js";
import { DefaultWorldGenerator } from "./world-generator.js";
import { DefaultWorldServer, type WorldServer } from "./world-server.js";

/**
 * The refactored half of Java's minecraft example: domain-rich names, traced through
 * `traceObject` with explicit `paramNames` maps — the non-decorator way to name parameters.
 */
export function createTracedWorldServer(context: NarrativeContext): WorldServer {
  const trace = <T extends object>(target: T, className: string, names: Record<string, string[]>) =>
    traceObject(target, context, names, { className });
  return trace(
    new DefaultWorldServer(
      trace(new DefaultWorldGenerator(), "WorldGenerator", { generateChunk: ["x", "z"] }),
      trace(new DefaultPlayerInventory(), "PlayerInventory", { addItem: ["item", "quantity"] }),
      trace(new DefaultCraftingTable(), "CraftingTable", { craft: ["recipe"] }),
      trace(new DefaultCreatureSpawner(), "CreatureSpawner", {
        spawnHostile: ["type", "x", "y", "z"],
      }),
    ),
    "WorldServer",
    { playerJoined: ["playerName"] },
  );
}

function section(ctx: ScenarioContext, title: string, body: string): void {
  ctx.print(`\n--- ${title} ---\n`);
  ctx.print(body);
}

const playerJoinsWorld: Scenario = {
  title: "Refactored: Player Joins World",
  wiring:
    "Wiring: no decorators — every interface is wrapped with traceObject(impl, context,\n" +
    "paramNames, { className }); the paramNames map names the parameters and className labels\n" +
    "the span with the interface, not the Default* class. The pipeline is the same\n" +
    "DualPathPipeline the other examples use.",
  run: async (ctx) => {
    ctx.print("  Domain-specific names make the trace self-documenting.\n");
    createTracedWorldServer(ctx.context).playerJoined("Steve");
    const tree = ctx.context.captureTrace();
    ctx.capture(playerJoinsWorld.title, tree);
    section(ctx, "Trace tree", renderIndentedText(tree));
    section(ctx, "Mermaid", renderMermaidSequence(tree));
    section(ctx, "PlantUML", renderPlantUmlSequence(tree));
  },
};

export const scenarios: readonly Scenario[] = [playerJoinsWorld];
