// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import {
  type DataResult,
  DefaultDataProcessor,
  DefaultEntityHandler,
  DefaultGameManager,
  DefaultStateManager,
  DefaultThingFactory,
  type Entity,
} from "../src/index.js";

// DataResult / Entity types

test("DataResult has opaque fields", () => {
  const result: DataResult = { a: 0, b: 0, label: "plains", count: 65536 };
  expect(result.label).toBe("plains");
  expect(result.count).toBe(65536);
});

test("Entity has kind and value", () => {
  const entity: Entity = { kind: "zombie", a: 10, b: 64, c: 20, value: 20 };
  expect(entity.kind).toBe("zombie");
  expect(entity.value).toBe(20);
});

// DataProcessor

test("DefaultDataProcessor processes coordinates", () => {
  const processor = new DefaultDataProcessor();
  const result = processor.process(0, 0);
  expect(result.a).toBe(0);
  expect(result.b).toBe(0);
  expect(result.label).toBeTruthy();
  expect(result.count).toBe(65536);
});

// StateManager

test("DefaultStateManager updates state", () => {
  const manager = new DefaultStateManager();
  const result = manager.update({ name: "stone", quantity: 1 }, 10);
  expect(result).toBe(true);
});

test("DefaultStateManager rejects overflow", () => {
  const manager = new DefaultStateManager();
  const result = manager.update({ name: "stone", quantity: 1 }, 65);
  expect(result).toBe(false);
});

// ThingFactory

test("DefaultThingFactory creates from recipe", () => {
  const factory = new DefaultThingFactory();
  const item = factory.create({
    name: "oak_planks",
    ingredients: [{ name: "oak_log", quantity: 1 }],
  });
  expect(item.name).toBe("oak_planks");
  expect(item.quantity).toBe(1);
});

test("DefaultThingFactory rejects empty recipe", () => {
  const factory = new DefaultThingFactory();
  expect(() => factory.create({ name: "nothing", ingredients: [] })).toThrow(
    'Recipe "nothing" has no ingredients',
  );
});

// EntityHandler

test("DefaultEntityHandler executes with value", () => {
  const handler = new DefaultEntityHandler();
  const entity = handler.execute("zombie", 10, 64, 20);
  expect(entity.kind).toBe("zombie");
  expect(entity.value).toBe(20);
});

test("DefaultEntityHandler falls back to default value for unknown kind", () => {
  const handler = new DefaultEntityHandler();
  const entity = handler.execute("unknown_creature", 0, 0, 0);
  expect(entity.value).toBe(20);
});

test("DefaultEntityHandler gives enderman more value", () => {
  const handler = new DefaultEntityHandler();
  const entity = handler.execute("enderman", 0, 0, 0);
  expect(entity.value).toBe(40);
});

// GameManager

test("DefaultGameManager orchestrates handle", () => {
  const manager = new DefaultGameManager(
    new DefaultDataProcessor(),
    new DefaultStateManager(),
    new DefaultThingFactory(),
    new DefaultEntityHandler(),
  );
  const message = manager.handle("Steve");
  expect(message).toMatch(/^Steve joined the world in \w+ biome$/);
});
