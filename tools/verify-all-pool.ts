// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Runs `worker` over every item in `items`, at most `limit` concurrently — the equivalent of
 * Java's `./gradlew --max-workers=2`: this is a large, memory-constrained shared dev container,
 * and `verify:all` fans out to 20+ package-level invocations for the test/coverage pass, so an
 * unbounded `Promise.all` risks choking it.
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => R | Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function runNext(): Promise<void> {
    const index = next++;
    if (index >= items.length) return;
    results[index] = await worker(items[index] as T, index);
    await runNext();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}
