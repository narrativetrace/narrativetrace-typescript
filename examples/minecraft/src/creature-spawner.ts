// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Creature, CreatureType } from "./domain.js";

export interface CreatureSpawner {
  spawnHostile(type: CreatureType, x: number, y: number, z: number): Creature;
}

const HEALTH: Record<CreatureType, number> = {
  zombie: 20,
  skeleton: 20,
  creeper: 20,
  spider: 16,
  enderman: 40,
};

export class DefaultCreatureSpawner implements CreatureSpawner {
  spawnHostile(type: CreatureType, x: number, y: number, z: number): Creature {
    return { type, x, y, z, health: HEALTH[type] };
  }
}
