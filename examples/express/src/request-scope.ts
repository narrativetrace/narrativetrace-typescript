// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  AsyncNarrativeContext,
  NarrativeTraceConfig,
  renderIndentedText,
} from "@narrativetrace/core-node";
import { traceObject } from "@narrativetrace/proxy";

// One context for the process; one run() scope per request.
export const context = new AsyncNarrativeContext(new NarrativeTraceConfig());

class OrderService {
  placeOrder(customerId: string, quantity: number): string {
    return `ORD-${customerId}-${quantity}`;
  }
}

const orders = traceObject(new OrderService(), context, { placeOrder: ["customerId", "quantity"] });

export async function handleRequest(
  customerId: string,
  exportTrace: (trace: string) => void = console.log,
): Promise<string> {
  return context.run(async () => {
    try {
      const orderId = orders.placeOrder(customerId, 2);
      // captureTrace() reads the current scope: call it here, inside run().
      exportTrace(renderIndentedText(context.captureTrace()));
      return orderId;
    } finally {
      context.reset();
    }
  });
}
