// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { formatTraceparent, generateSpanId } from "@narrativetrace/core";
import { useMemo } from "react";
import { useNarrativeTrace } from "./use-narrative-trace.js";

export function useTracedFetch(): typeof fetch {
  const ctx = useNarrativeTrace();
  return useMemo(() => {
    return (input: RequestInfo | URL, init?: RequestInit) => {
      const base = input instanceof Request ? input.headers : undefined;
      const headers = new Headers(init?.headers ?? base);
      headers.set("traceparent", formatTraceparent(ctx.traceId(), generateSpanId()));
      return fetch(input, { ...init, headers });
    };
  }, [ctx]);
}
