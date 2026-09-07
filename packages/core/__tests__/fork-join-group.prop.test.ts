// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import * as fc from "fast-check";
import { expect, test } from "vitest";
import { NarrativeTraceConfig } from "../src/config.js";
import { SyncNarrativeContext } from "../src/context.js";
import { ForkJoinGroup } from "../src/fork-join-group.js";

function makeContext() {
  return new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
}

test("join returns results in fork order for any task count", () => {
  fc.assert(
    fc.asyncProperty(fc.integer({ min: 0, max: 20 }), async (n) => {
      const parent = makeContext();
      const group = ForkJoinGroup.create(parent);
      const expected: number[] = [];
      for (let i = 0; i < n; i++) {
        expected.push(i);
        group.fork((ctx) => {
          ctx.enterMethod("Svc", `task${i}`, []);
          ctx.exitMethodWithReturn(`"${i}"`);
          return i;
        });
      }
      const results = await group.join();
      expect(results).toEqual(expected);
    }),
  );
});

test("all forked children share the same groupId", () => {
  fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (n) => {
      const parent = makeContext();
      parent.enterMethod("Ctrl", "handle", []);
      const group = ForkJoinGroup.create(parent);
      for (let i = 0; i < n; i++) {
        group.fork((ctx) => {
          ctx.enterMethod("Svc", `task${i}`, []);
          ctx.exitMethodWithReturn(`"${i}"`);
        });
      }
      await group.join();
      parent.exitMethodWithReturn('"done"');
      const tree = parent.captureTrace();
      for (const child of tree.roots[0].children) {
        expect(child.concurrency?.groupId).toBe(group.groupId);
        expect(child.concurrency?.kind).toBe("fork-join");
      }
    }),
  );
});

test("every create produces a unique groupId", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 50 }), (n) => {
      const ctx = makeContext();
      const ids = new Set<string>();
      for (let i = 0; i < n; i++) {
        ids.add(ForkJoinGroup.create(ctx).groupId);
      }
      expect(ids.size).toBe(n);
    }),
  );
});
