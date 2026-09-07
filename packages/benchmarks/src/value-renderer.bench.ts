// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderValue } from "@narrativetrace/core";
import { bench, describe } from "vitest";

describe("renderValue throughput", () => {
  bench("primitive (number)", () => {
    renderValue(42);
  });

  bench("primitive (string)", () => {
    renderValue("hello world");
  });

  bench("small object (3 keys)", () => {
    renderValue({ id: 1, name: "Alice", active: true });
  });

  bench("array (10 items)", () => {
    renderValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  const nested = {
    user: { name: "Alice", address: { city: "NYC", zip: "10001" } },
    items: [{ id: 1 }, { id: 2 }],
  };

  bench("nested object", () => {
    renderValue(nested);
  });

  const longString = "x".repeat(500);

  bench("long string (500 chars, truncated)", () => {
    renderValue(longString);
  });
});
