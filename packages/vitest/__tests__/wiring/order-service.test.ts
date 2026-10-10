// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { OrderService } from "./order-service.js";

const narrativeTest = createNarrativeTest();

narrativeTest("places an order", ({ narrativeContext }) => {
  const orders = traceObject(new OrderService(), narrativeContext, {
    placeOrder: ["customerId", "quantity"],
  });

  orders.placeOrder("C-1", 2);

  expect(narrativeContext.captureTrace().roots).toHaveLength(1);
});
