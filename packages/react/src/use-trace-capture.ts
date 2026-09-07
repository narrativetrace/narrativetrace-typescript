// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { useCallback } from "react";
import { useNarrativeTrace } from "./use-narrative-trace.js";

export function useTraceCapture() {
  const ctx = useNarrativeTrace();
  const capture = useCallback((): TraceTree => ctx.captureTrace(), [ctx]);
  const reset = useCallback((): void => ctx.reset(), [ctx]);
  const captureAndReset = useCallback((): TraceTree => {
    const tree = ctx.captureTrace();
    ctx.reset();
    return tree;
  }, [ctx]);
  return { capture, reset, captureAndReset };
}
