// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import {
  NarrativeTraceConfig,
  SyncNarrativeContext,
  type TracingLevel,
} from "@narrativetrace/core";
import { type ReactNode, useMemo } from "react";
import { NarrativeTraceContext } from "./context.js";

export interface NarrativeTraceProviderProps {
  children: ReactNode;
  level?: TracingLevel;
}

export function NarrativeTraceProvider({
  children,
  level = "detail",
}: NarrativeTraceProviderProps) {
  const ctx = useMemo(() => new SyncNarrativeContext(new NarrativeTraceConfig(level)), [level]);
  return <NarrativeTraceContext.Provider value={ctx}>{children}</NarrativeTraceContext.Provider>;
}
