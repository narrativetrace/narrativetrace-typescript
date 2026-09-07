// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import {
  type Chunk,
  type Creature,
  type CreatureType,
  DefaultCraftingTable,
  DefaultCreatureSpawner,
  DefaultPlayerInventory,
  DefaultWorldGenerator,
  DefaultWorldServer,
  type Item,
  type Recipe,
} from "../src/index.js";

// Domain types

test("Item has name and quantity", () => {
  const item: Item = { name: "diamond", quantity: 3 };
  expect(item.name).toBe("diamond");
  expect(item.quantity).toBe(3);
});

test("CreatureType accepts all valid values", () => {
  const types: CreatureType[] = ["zombie", "skeleton", "creeper", "spider", "enderman"];
  expect(types).toHaveLength(5);
});

test("Creature has type and position", () => {
  const creature: Creature = { type: "zombie", x: 10, y: 64, z: 20, health: 20 };
  expect(creature.type).toBe("zombie");
  expect(creature.health).toBe(20);
});

test("Recipe has name and ingredients", () => {
  const recipe: Recipe = {
    name: "oak_planks",
    ingredients: [{ name: "oak_log", quantity: 1 }],
  };
  expect(recipe.name).toBe("oak_planks");
  expect(recipe.ingredients).toHaveLength(1);
});

test("Chunk has coordinates and biome", () => {
  const chunk: Chunk = { x: 0, z: 0, biome: "plains", blockCount: 65536 };
  expect(chunk.biome).toBe("plains");
  expect(chunk.blockCount).toBe(65536);
});

// WorldGenerator

test("DefaultWorldGenerator generates chunk with biome", () => {
  const generator = new DefaultWorldGenerator();
  const chunk = generator.generateChunk(0, 0);
  expect(chunk.x).toBe(0);
  expect(chunk.z).toBe(0);
  expect(chunk.biome).toBeTruthy();
  expect(chunk.blockCount).toBe(65536);
});

test("DefaultWorldGenerator varies biome by coordinates", () => {
  const generator = new DefaultWorldGenerator();
  const chunk1 = generator.generateChunk(0, 0);
  const chunk2 = generator.generateChunk(1, 0);
  expect(chunk1.biome).not.toBe(chunk2.biome);
});

test("DefaultWorldGenerator returns valid biome for all mod-5 indices", () => {
  const generator = new DefaultWorldGenerator();
  for (let i = 0; i < 5; i++) {
    const chunk = generator.generateChunk(i, 0);
    expect(chunk.biome).toBeTruthy();
  }
});

// PlayerInventory

test("DefaultPlayerInventory adds items", () => {
  const inventory = new DefaultPlayerInventory();
  const result = inventory.addItem({ name: "stone", quantity: 1 }, 10);
  expect(result).toBe(true);
});

test("DefaultPlayerInventory rejects overflow", () => {
  const inventory = new DefaultPlayerInventory();
  const result = inventory.addItem({ name: "stone", quantity: 1 }, 65);
  expect(result).toBe(false);
});

// CraftingTable

test("DefaultCraftingTable crafts item from recipe", () => {
  const table = new DefaultCraftingTable();
  const item = table.craft({
    name: "oak_planks",
    ingredients: [{ name: "oak_log", quantity: 1 }],
  });
  expect(item.name).toBe("oak_planks");
  expect(item.quantity).toBe(1);
});

test("DefaultCraftingTable rejects empty recipe", () => {
  const table = new DefaultCraftingTable();
  expect(() => table.craft({ name: "nothing", ingredients: [] })).toThrow(
    'Recipe "nothing" has no ingredients',
  );
});

// CreatureSpawner

test("DefaultCreatureSpawner spawns creature with health", () => {
  const spawner = new DefaultCreatureSpawner();
  const creature = spawner.spawnHostile("zombie", 10, 64, 20);
  expect(creature.type).toBe("zombie");
  expect(creature.health).toBe(20);
  expect(creature.x).toBe(10);
});

test("DefaultCreatureSpawner gives enderman more health", () => {
  const spawner = new DefaultCreatureSpawner();
  const creature = spawner.spawnHostile("enderman", 0, 0, 0);
  expect(creature.health).toBe(40);
});

// WorldServer

test("DefaultWorldServer orchestrates player join", () => {
  const server = new DefaultWorldServer(
    new DefaultWorldGenerator(),
    new DefaultPlayerInventory(),
    new DefaultCraftingTable(),
    new DefaultCreatureSpawner(),
  );
  const message = server.playerJoined("Steve");
  expect(message).toMatch(/^Steve joined the world in \w+ biome$/);
});
