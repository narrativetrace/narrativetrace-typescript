// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { DataProcessor } from "./data-processor.js";
import type { EntityHandler } from "./entity-handler.js";
import type { StateManager } from "./state-manager.js";
import type { ThingFactory } from "./thing-factory.js";

export interface GameManager {
  handle(input: string): string;
}

export class DefaultGameManager implements GameManager {
  constructor(
    private readonly processor: DataProcessor,
    private readonly state: StateManager,
    private readonly factory: ThingFactory,
    private readonly handler: EntityHandler,
  ) {}

  handle(input: string): string {
    const result = this.processor.process(0, 0);
    const item = { name: "oak_log", quantity: 4 };
    this.state.update(item, item.quantity);
    const created = this.factory.create({
      name: "oak_planks",
      ingredients: [item],
    });
    this.state.update(created, 4);
    this.handler.execute("zombie", result.a + 10, 64, result.b + 10);
    return `${input} joined the world in ${result.label} biome`;
  }
}
