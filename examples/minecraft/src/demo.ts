// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createDemoContext } from "./scenario.js";
import { scenarios } from "./scenarios.js";

const context = createDemoContext();
for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.title} ===\n`);
  await scenario.run({ context, print: console.log, capture: () => undefined });
  context.reset();
}
