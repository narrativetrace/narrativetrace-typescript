// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Converts an amount in cents of one currency into cents of another, at today's rate. */
export class RateTableConverter {
  constructor(rates) {
    this.rates = rates;
  }

  convert(amountCents, from, to) {
    if (from === to) return amountCents;
    const rate = this.rates.rateFor(from, to);
    const units = Math.round((amountCents / 100) * rate);
    return units * 100;
  }
}
