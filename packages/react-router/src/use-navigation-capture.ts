// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { TraceTree } from "@narrativetrace/core";
import { useNarrativeTrace } from "@narrativetrace/react";
import { useRef } from "react";
import { useLocation } from "react-router-dom";

export function useNavigationCapture(onCapture?: (tree: TraceTree) => void): void {
  const ctx = useNarrativeTrace();
  const location = useLocation();
  const prevPathname = useRef(location.pathname);
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;

  if (prevPathname.current !== location.pathname) {
    const tree = ctx.captureTrace();
    prevPathname.current = location.pathname;
    if (tree.roots.length > 0) onCaptureRef.current?.(tree);
    ctx.reset();
  }
}
