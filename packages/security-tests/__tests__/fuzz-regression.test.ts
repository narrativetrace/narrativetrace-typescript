// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { fuzz as outputFormatJsonFuzz } from "../fuzz/output-format-json.fuzz.mjs";
import { fuzz as valueRendererFuzz } from "../fuzz/value-renderer.fuzz.mjs";

/**
 * Tier B, regression-replay half: the committed seed corpus for both fuzz targets, replayed
 * on every `pnpm run check` regardless of whether Jazzer.js itself can run here.
 *
 * INTENT: Jazzer.js's own regression mode (`--mode=regression`) does exactly this — replay
 * committed seeds with no fuzzing — but requires the native `@jazzer.js/fuzzer` addon, which
 * is unsupported on this container's platform (see `documentation/security-testing.md`,
 * "Tier B"). This test imports the fuzz targets' own `.mjs` files directly rather than a
 * separate copy, so there is exactly one implementation of each target's logic to keep
 * correct — this file only supplies the seeds and the loop.
 *
 * @llmNote A seed under `fuzz-seeds/` that starts failing here is exactly what Jazzer's own
 * regression mode would report on a real x86_64 run: a committed input the target no longer
 * survives. Treat it the same way — a real defect, not a flaky test.
 */

const FUZZ_DIR = fileURLToPath(new URL("../fuzz-seeds/", import.meta.url));

function seedsOf(target: string): { name: string; data: Buffer }[] {
  return readdirSync(`${FUZZ_DIR}${target}`).map((name) => ({
    name,
    data: readFileSync(`${FUZZ_DIR}${target}/${name}`),
  }));
}

describe("fuzz seed regression replay", () => {
  test.each(seedsOf("value-renderer"))("value-renderer/$name survives", ({ data }) => {
    expect(() => valueRendererFuzz(data)).not.toThrow();
  });

  test.each(seedsOf("output-format-json"))("output-format-json/$name survives", ({ data }) => {
    expect(() => outputFormatJsonFuzz(data)).not.toThrow();
  });
});
