// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core";
import { AsyncNarrativeContext, NarrativeTraceConfig } from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";
import { expect, test } from "vitest";
import { DefaultCraftingTable } from "../src/crafting-table.js";
import { DefaultCreatureSpawner } from "../src/creature-spawner.js";
import { DefaultPlayerInventory } from "../src/player-inventory.js";
import { DefaultWorldGenerator } from "../src/world-generator.js";
import { DefaultWorldServer } from "../src/world-server.js";

function createTracedWorldServer() {
  const ctx = new AsyncNarrativeContext(new NarrativeTraceConfig("detail"));
  const server = traceObject(
    new DefaultWorldServer(
      traceObject(new DefaultWorldGenerator(), ctx, undefined, { className: "WorldGenerator" }),
      traceObject(new DefaultPlayerInventory(), ctx, undefined, { className: "PlayerInventory" }),
      traceObject(new DefaultCraftingTable(), ctx, undefined, { className: "CraftingTable" }),
      traceObject(new DefaultCreatureSpawner(), ctx, undefined, { className: "CreatureSpawner" }),
    ),
    ctx,
    undefined,
    { className: "WorldServer" },
  );
  return { server, ctx };
}

test("traced playerJoined produces single root trace node", () => {
  const { server, ctx } = createTracedWorldServer();
  server.playerJoined("Steve");
  const trace = ctx.captureTrace();
  expect(trace.roots).toHaveLength(1);
});

test("root trace node has WorldServer.playerJoined signature", () => {
  const { server, ctx } = createTracedWorldServer();
  server.playerJoined("Steve");
  const trace = ctx.captureTrace();
  expect(trace.roots[0]?.signature.className).toBe("WorldServer");
  expect(trace.roots[0]?.signature.methodName).toBe("playerJoined");
});

test("root trace node has returned outcome", () => {
  const { server, ctx } = createTracedWorldServer();
  server.playerJoined("Steve");
  const trace = ctx.captureTrace();
  expect(trace.roots[0]?.outcome.kind).toBe("returned");
});

test("traced playerJoined has four child service calls", () => {
  const { server, ctx } = createTracedWorldServer();
  server.playerJoined("Steve");
  const trace = ctx.captureTrace();
  const classNames = trace.roots[0]?.children.map((c) => c.signature.className);
  expect(classNames).toContain("WorldGenerator");
  expect(classNames).toContain("PlayerInventory");
  expect(classNames).toContain("CraftingTable");
  expect(classNames).toContain("CreatureSpawner");
});

test("renderIndentedText produces output containing WorldServer", () => {
  const { server, ctx } = createTracedWorldServer();
  server.playerJoined("Steve");
  const trace = ctx.captureTrace();
  const output = renderIndentedText(trace);
  expect(output.length).toBeGreaterThan(0);
  expect(output).toContain("WorldServer");
});
