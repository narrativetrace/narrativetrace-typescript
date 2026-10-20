// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// One real service boundary: an interface-shaped class with a single method worth tracing.
// Deliberately free of NarrativeTrace — the prompt's "otherwise work inside the existing project
// and trace one real service boundary" branch starts from here.
export class InvoiceService {
  issueInvoice(customerId, amountCents, currency) {
    if (amountCents <= 0) {
      throw new RangeError(`amountCents must be positive, got ${amountCents}`);
    }
    return {
      id: `INV-${customerId}-${amountCents}`,
      customerId,
      amountCents,
      currency,
    };
  }
}
