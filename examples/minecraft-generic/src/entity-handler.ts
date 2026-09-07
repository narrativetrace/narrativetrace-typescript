// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Entity } from "./domain.js";

export interface EntityHandler {
  execute(kind: string, a: number, b: number, c: number): Entity;
}

const VALUES: Record<string, number> = {
  zombie: 20,
  skeleton: 20,
  creeper: 20,
  spider: 16,
  enderman: 40,
};

export class DefaultEntityHandler implements EntityHandler {
  execute(kind: string, a: number, b: number, c: number): Entity {
    return { kind, a, b, c, value: VALUES[kind] ?? 20 };
  }
}
