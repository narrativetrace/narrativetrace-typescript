// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { DataResult } from "./domain.js";

export interface DataProcessor {
  process(a: number, b: number): DataResult;
}

const LABELS = ["plains", "forest", "desert", "mountains", "ocean"] as const;

export class DefaultDataProcessor implements DataProcessor {
  process(a: number, b: number): DataResult {
    const index = Math.abs(a + b) % LABELS.length;
    const label = LABELS[index] as string;
    return { a, b, label, count: 65536 };
  }
}
