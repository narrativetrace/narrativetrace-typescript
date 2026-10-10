// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { useTraceCapture, useTraced } from "@narrativetrace/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NarrativeTraceRoot } from "./root.js";

afterEach(cleanup);

class OrderService {
  placeOrder(customerId: string): string {
    return `order for ${customerId}`;
  }
}

function Checkout({ onCaptured }: { onCaptured: (tree: TraceTree) => void }) {
  const orders = useTraced(() => new OrderService(), "OrderService");
  const { captureAndReset } = useTraceCapture();
  orders.placeOrder("C-1");
  onCaptured(captureAndReset());
  return null;
}

describe("the react row's wiring snippet", () => {
  test("gives every component under it a context that records traced calls", () => {
    const captured: TraceTree[] = [];
    render(
      <NarrativeTraceRoot>
        <Checkout onCaptured={(tree) => captured.push(tree)} />
      </NarrativeTraceRoot>,
    );

    expect(captured[0]?.roots[0]?.signature.className).toBe("OrderService");
    expect(captured[0]?.roots[0]?.signature.methodName).toBe("placeOrder");
  });
});
