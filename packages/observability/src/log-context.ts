// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { AsyncLocalStorage } from "node:async_hooks";

type ContextValue = string | number;

let storage = new AsyncLocalStorage<Map<string, ContextValue>>();

export class LogContext {
  static set(key: string, value: ContextValue): void {
    LogContext.store().set(key, value);
  }

  static get(key: string): ContextValue | undefined {
    return storage.getStore()?.get(key);
  }

  static clear(): void {
    storage.getStore()?.clear();
  }

  static reset(): void {
    storage = new AsyncLocalStorage();
  }

  static remove(key: string): void {
    storage.getStore()?.delete(key);
  }

  static run<T>(values: Record<string, ContextValue>, fn: () => T): T {
    const child = new Map(storage.getStore() ?? []);
    for (const [k, v] of Object.entries(values)) {
      child.set(k, v);
    }
    return storage.run(child, fn);
  }

  static getAll(): Record<string, ContextValue> {
    return Object.fromEntries(storage.getStore() ?? []);
  }

  private static store(): Map<string, ContextValue> {
    const existing = storage.getStore();
    if (existing) return existing;
    const root = new Map<string, ContextValue>();
    storage.enterWith(root);
    return root;
  }
}
