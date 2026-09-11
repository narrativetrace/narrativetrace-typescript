// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { createPinoEventConsumer } from "@narrativetrace/pino";
import pino from "pino";
import { createDemoContext } from "./scenario.js";
import { scenarios } from "./scenarios.js";

// Send the same trace to a real logger — documentation/framework-integration-guide.md § 9
// (Winston & Pino). Console narration below is unchanged; the pino consumer is an additional
// listener on the pipeline's sync path, not a replacement for it.
const logger = pino();
const pinoConsumer = createPinoEventConsumer(logger, {
  levels: { enter: "info", return: "info", exception: "error" },
});
const context = createDemoContext(pinoConsumer);
for (const scenario of scenarios) {
  console.log(`\n=== ${scenario.title} ===\n`);
  await scenario.run({ context, print: console.log, capture: () => undefined });
  context.reset();
}
