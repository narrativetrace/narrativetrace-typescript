// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export type Item = {
  readonly name: string;
  readonly quantity: number;
};

export type CreatureType = "zombie" | "skeleton" | "creeper" | "spider" | "enderman";

export type Creature = {
  readonly type: CreatureType;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly health: number;
};

export type Recipe = {
  readonly name: string;
  readonly ingredients: readonly Item[];
};

export type Chunk = {
  readonly x: number;
  readonly z: number;
  readonly biome: string;
  readonly blockCount: number;
};
