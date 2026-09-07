// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
interface Entry<V> {
  value: V;
  insertedAt: number;
}

/**
 * A bounded, TTL-expiring map that runs an eviction callback for every entry it drops.
 *
 * INTENT: track short-lived resources (e.g. in-flight trace/group state) that must be cleaned up
 * even if never explicitly removed. Guarantees bounded memory: expired entries are purged and the
 * oldest entries are evicted once `maxCapacity` is reached, each firing `onEvict` for cleanup.
 *
 * @remarks Eviction is lazy — expiry and capacity checks run on {@link put}, not on a timer. The
 * injectable `clock` exists for deterministic testing of TTL behaviour.
 */
export class PerishableMap<K, V> {
  private readonly entries = new Map<K, Entry<V>>();
  private readonly maxCapacity: number;
  private readonly ttlMs: number;
  private readonly onEvict: (value: V) => void;
  private readonly clock: () => number;

  constructor(
    maxCapacity: number,
    ttlMs: number,
    onEvict: (value: V) => void,
    clock: () => number = Date.now,
  ) {
    this.maxCapacity = maxCapacity;
    this.ttlMs = ttlMs;
    this.onEvict = onEvict;
    this.clock = clock;
  }

  put(key: K, value: V): void {
    this.evictExpired();
    if (!this.entries.has(key)) {
      this.evictOverCapacity();
    }
    this.entries.set(key, { value, insertedAt: this.clock() });
  }

  private evictOverCapacity(): void {
    while (this.entries.size >= this.maxCapacity) {
      const oldest = this.entries.keys().next().value as K;
      const entry = this.entries.get(oldest)!;
      this.entries.delete(oldest);
      this.onEvict(entry.value);
    }
  }

  private evictExpired(): void {
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      if (now - entry.insertedAt > this.ttlMs) {
        this.entries.delete(key);
        this.onEvict(entry.value);
      }
    }
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    return entry.value;
  }

  remove(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    this.entries.delete(key);
    return entry.value;
  }

  get size(): number {
    return this.entries.size;
  }
}
