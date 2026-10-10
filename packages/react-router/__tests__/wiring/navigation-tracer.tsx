// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { renderIndentedText } from "@narrativetrace/core";
import { useNavigationCapture } from "@narrativetrace/react-router";

/**
 * Render it once, inside both your router and <NarrativeTraceProvider>, next to your routes.
 * Every navigation then prints the trace of the page it leaves.
 */
export function NavigationTracer() {
  useNavigationCapture((tree) => console.log(renderIndentedText(tree)));
  return null;
}
