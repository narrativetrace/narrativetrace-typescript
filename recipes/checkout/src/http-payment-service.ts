// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// src/http-payment-service.ts
import { type AsyncNarrativeContext, tracedFetch } from "@narrativetrace/core-node";
import { PaymentDeclinedError } from "./payments.js";

/** Charges a card through a payment service that is a different process; the answer is a promise. */
export interface RemotePaymentService {
  charge(customerId: string, amountCents: number, card: string): Promise<string>;
}

const DECLINED_STATUS = 402;

/**
 * The checkout's payment collaborator when the payment service is another process.
 *
 * INTENT: the outbound half of cross-service correlation, in the shape any HTTP client copies:
 * `tracedFetch(context)` is global `fetch` that stamps the W3C `traceparent` of the span open at
 * call time. The callee then continues this trace instead of starting its own.
 *
 * @llmNote The request body is a comma-separated line rather than JSON on purpose: this class exists
 * to show the header, and a parser would be the only thing a reader had to skip. `tracedFetch` is
 * the first thing `charge` calls, before any `await`: the header names the span that is open while
 * the call is made, and that is `charge`'s own only until the method first yields.
 *
 * @edgeCase With no span open there is nothing to name, and `tracedFetch` sends no header at all —
 * the honest outcome, since a header without a real parent id would point the callee at a span that
 * never existed.
 */
export class HttpPaymentService implements RemotePaymentService {
  private readonly send: typeof globalThis.fetch;

  constructor(
    context: AsyncNarrativeContext,
    private readonly endpoint: string,
  ) {
    this.send = tracedFetch(context);
  }

  async charge(customerId: string, amountCents: number, card: string): Promise<string> {
    const response = await this.send(this.endpoint, {
      method: "POST",
      body: `${customerId},${amountCents},${card}`,
    });
    const body = await response.text();
    if (response.status === DECLINED_STATUS) {
      throw new PaymentDeclinedError(body);
    }
    return body;
  }
}
