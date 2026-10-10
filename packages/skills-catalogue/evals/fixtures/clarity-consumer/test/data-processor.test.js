// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { createNarrativeTest } from "@narrativetrace/vitest";
import { expect } from "vitest";
import { DataProcessor } from "../src/data-processor.js";

const test = createNarrativeTest();

test("a customer places an order", ({ narrativeContext }) => {
  const processor = traceObject(new DataProcessor(), narrativeContext, { execute: ["data"] });

  expect(processor.execute({ customerId: "C-1", sku: "SKU-7", quantity: 2 })).toBe(
    "ORD-C-1-SKU-7-2",
  );
});
