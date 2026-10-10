// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { compose } from "../src/checkout.js";

const test = createNarrativeTest();

// Drives the checkout as production wires it, every collaborator traced.
test("customer checks out", ({ narrativeContext }) => {
  const { checkout } = compose((service, names) => traceObject(service, narrativeContext, names));

  const result = checkout.checkout({
    customerId: "C-1042",
    lines: [{ sku: "KB-01", priceCents: 4599, quantity: 1 }],
  });

  expect(result.status).toBe("paid");
});
