// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { NarrativeContext } from "@narrativetrace/core";
import { useContext } from "react";
import { NarrativeTraceContext } from "./context.js";

export function useNarrativeTrace(): NarrativeContext {
  const ctx = useContext(NarrativeTraceContext);
  if (!ctx) throw new Error("useNarrativeTrace must be used within NarrativeTraceProvider");
  return ctx;
}
