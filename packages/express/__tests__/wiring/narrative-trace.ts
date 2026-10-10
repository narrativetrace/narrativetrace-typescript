// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceConfig, renderIndentedText } from "@narrativetrace/core-node";
import { createExpressNarrativeContext, narrativeTrace } from "@narrativetrace/express";
import type { Express } from "express";

/**
 * Call once, before your routes. Trace each service with the context it returns, so every
 * request prints its own trace: traceObject(new OrderService(), narrativeContext, …).
 */
export function addNarrativeTrace(app: Express) {
  const narrativeContext = createExpressNarrativeContext(new NarrativeTraceConfig());
  app.use(
    narrativeTrace(narrativeContext, {
      onRequestComplete(_request, _response, context) {
        console.log(renderIndentedText(context.captureTrace()));
      },
    }),
  );
  return narrativeContext;
}
