// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { Item, Recipe } from "./domain.js";

export interface CraftingTable {
  craft(recipe: Recipe): Item;
}

export class DefaultCraftingTable implements CraftingTable {
  craft(recipe: Recipe): Item {
    if (recipe.ingredients.length === 0) {
      throw new Error(`Recipe "${recipe.name}" has no ingredients`);
    }
    return { name: recipe.name, quantity: 1 };
  }
}
