// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traceObject } from "@narrativetrace/proxy";
import { useMemo } from "react";
import { useNarrativeTrace } from "./use-narrative-trace.js";

export function useTraced<T extends object>(factory: () => T, className?: string): T {
  const ctx = useNarrativeTrace();
  // biome-ignore lint/correctness/useExhaustiveDependencies: factory intentionally excluded — callers pass inline lambdas
  return useMemo(
    () => traceObject(factory(), ctx, undefined, className ? { className } : undefined),
    [ctx, className],
  );
}
