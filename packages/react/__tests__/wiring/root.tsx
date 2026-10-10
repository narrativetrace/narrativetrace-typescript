// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { NarrativeTraceProvider } from "@narrativetrace/react";
import type { ReactNode } from "react";

/**
 * Wrap your whole app once, where it is rendered: <NarrativeTraceRoot><App /></NarrativeTraceRoot>.
 * Inside it, useTraced traces a service and useTraceCapture hands back what it recorded.
 */
export function NarrativeTraceRoot({ children }: { children: ReactNode }) {
  return <NarrativeTraceProvider>{children}</NarrativeTraceProvider>;
}
