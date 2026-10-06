// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "vitest/config";
import type { TestSpecification } from "vitest/node";
import { BaseSequencer } from "vitest/node";

/**
 * Vitest's default sequencer sorts discovered files by path, not by an `include` array's order
 * (verified empirically: swapping the `include` order below left the run order unchanged) — so
 * an `include` list alone cannot fix the ordering this package's mtime-race depends on. This
 * sequencer forces exactly one order: `index.test.js` (the redaction scenario) always runs before
 * `__tests__/sixty-seconds.test.ts`, so the "places an order" scenario's write is always the last
 * one on disk — see the comment on `fileParallelism` below for why that matters.
 */
class TraceOrderSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const rank = (file: TestSpecification): number =>
      file.moduleId.endsWith("sixty-seconds.test.ts") ? 1 : 0;
    return [...files].sort((a, b) => rank(a) - rank(b));
  }
}

/**
 * Test-only demo package, not a library with its own `src/`: `index.js`/`index-with-logger.js` are
 * the hand-run tutorial entry points (documentation/sixty-seconds.md), never imported by the
 * suite (duplicating the entry point's real side effects — a fresh `SyncNarrativeContext`,
 * `console.log` — would defeat the point of running it by hand). `index.js`'s call is driven
 * independently through `@narrativetrace/vitest`'s fixture; `index-with-logger.js` is instead run
 * as a real child process and its volatile JSON fields normalized after the fact (its own test
 * file), since mirroring its pino/DualPathPipeline setup here would be a second copy to drift.
 * No coverage floor applies
 * (same reasoning as `packages/security-tests/vitest.config.ts`); coverage stays enabled so a
 * production module, if one is ever added under `src/`, does not go silently unmeasured.
 */
export default defineConfig({
  test: {
    // Both test files write into the SAME shared narrativetrace-output/ tree via
    // @narrativetrace/vitest's createNarrativeTest fixture (structural + rendered trace per
    // scenario), and packages/skills-catalogue's Tier A2 replay test asserts that the "newest"
    // file under that tree — a generalised, never-hardcoded glob a real project's doctor command
    // would run the same way — resolves to THIS package's own "places an order" scenario. Default
    // vitest parallelism runs test files in separate workers with no ordering guarantee between
    // them, so which scenario's write lands last was a coin flip once a second file (index.test.js,
    // added for the redaction fixture) started sharing the directory — fileParallelism: false
    // makes the run sequential, and TraceOrderSequencer above pins the order within it.
    fileParallelism: false,
    sequence: { sequencer: TraceOrderSequencer },
    coverage: {
      provider: "v8",
      include: ["src/**"],
    },
  },
});
