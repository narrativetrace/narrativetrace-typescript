// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { AsyncLocalStorage } from "node:async_hooks";
import type { SyncNarrativeContext } from "@narrativetrace/core";
import { Injectable } from "@nestjs/common";

@Injectable()
export class NarrativeStorage {
  private readonly als = new AsyncLocalStorage<SyncNarrativeContext>();

  run<T>(ctx: SyncNarrativeContext, fn: () => T): T {
    return this.als.run(ctx, fn);
  }

  current(): SyncNarrativeContext | undefined {
    return this.als.getStore();
  }
}
