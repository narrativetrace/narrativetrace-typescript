// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Chunk } from "./domain.js";

export interface WorldGenerator {
  generateChunk(x: number, z: number): Chunk;
}

const BIOMES = ["plains", "forest", "desert", "mountains", "ocean"] as const;

export class DefaultWorldGenerator implements WorldGenerator {
  generateChunk(x: number, z: number): Chunk {
    const biomeIndex = Math.abs(x + z) % BIOMES.length;
    const biome = BIOMES[biomeIndex] as string;
    return { x, z, biome, blockCount: 65536 };
  }
}
