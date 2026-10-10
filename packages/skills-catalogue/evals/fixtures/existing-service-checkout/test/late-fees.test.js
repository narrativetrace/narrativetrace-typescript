// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { expect, test } from "vitest";
import { feeFor } from "../src/late-fees.js";

test("no fee before the due date", () => {
  expect(feeFor(0)).toBe(0);
});

test("150 cents for every day late", () => {
  expect(feeFor(3)).toBe(450);
});
