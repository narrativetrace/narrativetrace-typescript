// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { formatTraceparent, generateSpanId } from "@narrativetrace/core";
import { NARRATIVE_CONTEXT } from "./tokens.js";

export const traceInterceptor: HttpInterceptorFn = (req, next) => {
  const ctx = inject(NARRATIVE_CONTEXT);
  const tracedReq = req.clone({
    setHeaders: {
      traceparent: formatTraceparent(ctx.traceId(), generateSpanId()),
    },
  });
  return next(tracedReq);
};
