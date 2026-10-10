// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core-node";
import { createHonoNarrativeContext, narrativeTrace } from "@narrativetrace/hono";
import type { Hono } from "hono";

/**
 * Call once, before your routes. Trace each service with the context it returns, so every
 * request prints its own trace: traceObject(new OrderService(), narrativeContext, …).
 */
export function addNarrativeTrace(app: Hono) {
  const narrativeContext = createHonoNarrativeContext(new NarrativeTraceConfig());
  app.use(
    "*",
    narrativeTrace(narrativeContext, {
      onRequestComplete(_c, context) {
        console.log(renderIndentedText(context.captureTrace()));
      },
    }),
  );
  return narrativeContext;
}
