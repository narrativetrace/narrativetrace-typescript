// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/** The late fee for an invoice paid `daysLate` days after it was due: 150 cents a day. */
export function feeFor(daysLate) {
  if (daysLate <= 0) return 0;
  return daysLate * 150;
}
