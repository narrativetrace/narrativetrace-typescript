// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { formatTraceparent } from "@narrativetrace/core";
import { requestParent } from "./request-origin.js";
import { NARRATIVE_CONTEXT } from "./tokens.js";

/**
 * HttpClient interceptor that adds a W3C `traceparent` to a request with a traced call behind it.
 *
 * INTENT: link the server's trace to the browser call that sent the request — and to nothing else.
 *
 * @llmNote The parent is the traced method whose returned Observable is being subscribed (see
 * `provideTraced`), else the span open on the context when the request is subscribed. A request
 * with neither — sent between interactions, or from a later tick than its traced subscription —
 * goes out with no header, so it never continues a finished trace. A context that throws while
 * naming the parent leaves the request untouched (no-poison).
 */
export const traceInterceptor: HttpInterceptorFn = (req, next) => {
  const parent = requestParent(inject(NARRATIVE_CONTEXT));
  if (parent === null) return next(req);
  const tracedReq = req.clone({
    setHeaders: {
      traceparent: formatTraceparent(parent.traceId, parent.spanId),
    },
  });
  return next(tracedReq);
};
