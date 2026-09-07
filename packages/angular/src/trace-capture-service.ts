// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { Injectable, inject } from "@angular/core";
import type { TraceTree } from "@narrativetrace/core";
import { NARRATIVE_CONTEXT } from "./tokens.js";

@Injectable({ providedIn: "root" })
export class TraceCaptureService {
  private readonly ctx = inject(NARRATIVE_CONTEXT);

  capture(): TraceTree {
    return this.ctx.captureTrace();
  }

  reset(): void {
    this.ctx.reset();
  }

  captureAndReset(): TraceTree {
    const tree = this.ctx.captureTrace();
    this.ctx.reset();
    return tree;
  }
}
