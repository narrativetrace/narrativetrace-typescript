// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Checks an order out: the kit issues, authorizes and settles it. */
export class CheckoutService {
  constructor(kit) {
    this.kit = kit;
  }

  checkout(order) {
    return this.kit.run(order);
  }
}
