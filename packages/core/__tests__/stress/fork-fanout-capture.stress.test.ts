// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { NarrativeTraceConfig } from "../../src/config.js";
import { SyncNarrativeContext } from "../../src/context.js";
import { ForkJoinGroup } from "../../src/fork-join-group.js";
import { countNodes, mulberry32, randomYield } from "./stress-helpers.js";
import { stressScale } from "./stress-scale.js";

// Generous, fixed regardless of mode: the short/gate-path run finishes in milliseconds, so this is
// a ceiling, not an added delay. The long sweep's real macrotask scheduling (up to 9000 concurrent
// setTimeout(0) yields) can land close to vitest's 5s default under load — flakiness from an
// under-sized timeout would defeat the point of a stress test.
const TEST_TIMEOUT_MS = 60_000;

describe("fork/fan-out capture reads every span it published (stress mirror of Java jcstress CapturePendingEventTest)", () => {
  test(
    "forked workers under randomized microtask/macrotask interleaving: zero span loss",
    async () => {
      const { seed, scale } = stressScale(0xc0ffee);
      const rand = mulberry32(seed);
      // Capped safely under the 10,000-span adoption ceiling (context.ts MAX_ADOPTED_SPANS): this
      // test's claim is zero-loss capture, a different property from ceiling refusal, which has
      // its own dedicated stress test (adoption-under-load.stress.test.ts).
      const WORKERS = Math.min(scale(512), 9000);
      const parent = new SyncNarrativeContext(new NarrativeTraceConfig("detail"));
      parent.enterMethod("Orchestrator", "fanOut", []);

      const group = ForkJoinGroup.create(parent);
      for (let i = 0; i < WORKERS; i++) {
        group.fork(async (ctx) => {
          await randomYield(rand);
          ctx.enterMethod("Worker", `task${i}`, []);
          await randomYield(rand);
          ctx.exitMethodWithReturn(`"${i}"`);
        });
      }
      await group.join();
      parent.exitMethodWithReturn('"done"');

      const tree = parent.captureTrace();
      const loss = parent.traceLoss();

      // 1 orchestrator root plus one child per worker — every published span accounted for.
      expect(countNodes(tree.roots)).toBe(WORKERS + 1);
      expect(loss.droppedEvents).toBe(0);
      expect(loss.refusedScopes).toBe(0);
      expect(loss.refusedSpans).toBe(0);
      expect(loss.discardedSpans).toBe(0);
    },
    TEST_TIMEOUT_MS,
  );
});
