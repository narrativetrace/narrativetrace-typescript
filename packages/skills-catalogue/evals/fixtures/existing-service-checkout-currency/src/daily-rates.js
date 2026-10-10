// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** Today's exchange rates, as published by the treasury each morning. */
export class DailyRates {
  constructor(table = { "EUR->CHF": 0.93, "EUR->USD": 1.08 }) {
    this.table = table;
  }

  rateFor(from, to) {
    if (from === to) return 1;
    const rate = this.table[`${from}->${to}`];
    if (rate === undefined) throw new RangeError(`no rate from ${from} to ${to}`);
    return rate;
  }
}
