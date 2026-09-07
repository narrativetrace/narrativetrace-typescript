// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { CraftingTable } from "./crafting-table.js";
import type { CreatureSpawner } from "./creature-spawner.js";
import type { PlayerInventory } from "./player-inventory.js";
import type { WorldGenerator } from "./world-generator.js";

export interface WorldServer {
  playerJoined(playerName: string): string;
}

export class DefaultWorldServer implements WorldServer {
  constructor(
    private readonly generator: WorldGenerator,
    private readonly inventory: PlayerInventory,
    private readonly crafting: CraftingTable,
    private readonly spawner: CreatureSpawner,
  ) {}

  playerJoined(playerName: string): string {
    const chunk = this.generator.generateChunk(0, 0);
    const wood = { name: "oak_log", quantity: 4 };
    this.inventory.addItem(wood, wood.quantity);
    const planks = this.crafting.craft({
      name: "oak_planks",
      ingredients: [wood],
    });
    this.inventory.addItem(planks, 4);
    this.spawner.spawnHostile("zombie", chunk.x + 10, 64, chunk.z + 10);
    return `${playerName} joined the world in ${chunk.biome} biome`;
  }
}
