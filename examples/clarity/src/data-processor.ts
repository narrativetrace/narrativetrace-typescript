// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { traced } from "@narrativetrace/proxy";

/** Tier 3 — intentionally poor naming: generic verb, generic class, generic parameters. */
export interface DataProcessor {
  execute(data: string, val: number): string;
}

export class DefaultDataProcessor implements DataProcessor {
  @traced("data", "val")
  execute(data: string, val: number): string {
    return `processed:${data}:${val}`;
  }
}
