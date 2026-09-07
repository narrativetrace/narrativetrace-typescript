// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
export interface ThingFactory {
  create(recipe: { name: string; ingredients: readonly { name: string; quantity: number }[] }): {
    name: string;
    quantity: number;
  };
}

export class DefaultThingFactory implements ThingFactory {
  create(recipe: { name: string; ingredients: readonly { name: string; quantity: number }[] }): {
    name: string;
    quantity: number;
  } {
    if (recipe.ingredients.length === 0) {
      throw new Error(`Recipe "${recipe.name}" has no ingredients`);
    }
    return { name: recipe.name, quantity: 1 };
  }
}
