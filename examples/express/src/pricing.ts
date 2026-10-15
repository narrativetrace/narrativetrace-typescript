// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { context } from "./request-scope.js";

function applyDiscount(price: number, percent: number): number {
  return price - (price * percent) / 100;
}

const { applyDiscount: tracedApplyDiscount } = traceObject({ applyDiscount }, context, {
  className: "Pricing",
  methods: { applyDiscount: { params: ["price", "percent"] } },
});

// Importers get the traced function; calls made inside this module still reach the plain one.
export { tracedApplyDiscount as applyDiscount };
