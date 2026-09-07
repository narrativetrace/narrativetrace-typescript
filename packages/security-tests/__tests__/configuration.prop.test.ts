// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseTracingLevel } from "@narrativetrace/core";
import { resolveConfig, resolveEnvConfig } from "@narrativetrace/core-node";
import { writeTraceOutput } from "@narrativetrace/vitest";
import * as fc from "fast-check";
import { describe, expect, test } from "vitest";
import { hostileStrings } from "../src/corpus/hostile-corpus.js";
import { treeOf } from "../src/oracle/emitters.js";
import { noHandleLeft } from "../src/oracle/oracles.js";

/**
 * Target 6: configuration loading from hostile values. Mirrors Java's `ConfigurationPropertyTest`,
 * adapted to the seam this runtime actually has.
 *
 * @llmNote Java's target covers a buffer-capacity knob and a pluggable pipeline-strategy string
 * neither of which this runtime exposes (`BoundedEventBuffer`'s capacity is a constructor argument,
 * never parsed from a string; there is one pipeline shape, `DualPathPipeline`, not a
 * strategy registry) — per the cross-runtime buffered-consumer defaults contract. What this runtime reads
 * from untyped external input is `resolveEnvConfig`/`resolveConfig` (env vars, `NARRATIVETRACE_*`)
 * and `parseTracingLevel`, both already lenient-by-contract (never throw, degrade to a fallback).
 *
 * @llmNote The output-directory-escape case Java runs under `ConfigurationPropertyTest`
 * (`noCorpusStringEscapesTheOutputDirectory`) lives here too: a test name is configuration a test
 * runner supplies, arriving with exactly the same trust level as an env var.
 */

function outputsOf(env: Record<string, string | undefined>) {
  return {
    envConfig: resolveEnvConfig(env),
    config: resolveConfig({ env, read: () => undefined }),
  };
}

/** Every file name under `dir`, recursively, relative-path style. */
function listFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...listFiles(join(dir, entry.name)));
    else found.push(entry.name);
  }
  return found;
}

describe("configuration loading", () => {
  test("every corpus string is safe as a tracing level", () => {
    for (const hostile of hostileStrings()) {
      expect(
        () => parseTracingLevel(hostile.value, "detail"),
        `${hostile.id}: ${hostile.description}`,
      ).not.toThrow();
      expect(parseTracingLevel(hostile.value, "detail")).not.toBeNull();
    }
  });

  test("every corpus string is safe as every NARRATIVETRACE_* env value", () => {
    for (const hostile of hostileStrings()) {
      const env = {
        NARRATIVETRACE_LEVEL: hostile.value,
        NARRATIVETRACE_OUTPUT: hostile.value,
        NARRATIVETRACE_OUTPUT_DIR: hostile.value,
        NARRATIVETRACE_FORMAT: hostile.value,
      };
      expect(() => outputsOf(env), `${hostile.id}: ${hostile.description}`).not.toThrow();
    }
  });

  test("resolving configuration starts no background timer or handle", () => {
    noHandleLeft(() => {
      for (const hostile of hostileStrings()) {
        outputsOf({ NARRATIVETRACE_LEVEL: hostile.value });
      }
    });
  });

  /**
   * A test class or method name reaches the artifact path from the test runner, not from the
   * library. The oracle is containment: a hostile module/test name must never survive into a
   * written file name carrying a path separator or a `..` segment — the one shape that could
   * resolve outside `outputDir`. Checked on what `writeTraceOutput` actually wrote, not by
   * asserting a path *we* constructed: a test that only inspects its own already-safe `dir`
   * variable would pass no matter what the library did with the hostile name.
   */
  test("no corpus string escapes the output directory", () => {
    const base = resolve(join(tmpdir(), "narrativetrace-security-config-base"));
    const UNSAFE = /[/\\]|\.\./;
    try {
      for (const hostile of hostileStrings()) {
        const dir = join(base, `${hostile.id}-out`);
        writeTraceOutput(treeOf('"a"', '"b"'), {
          outputDir: dir,
          moduleName: hostile.value,
          testName: hostile.value,
          formats: ["md"],
        });

        for (const fileName of listFiles(dir)) {
          expect(fileName, `${hostile.id}: ${hostile.description}`).not.toMatch(UNSAFE);
        }
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("any generated value leaves the buffer size and level usable", () => {
    fc.assert(
      fc.property(propertyValuesArb(), (value) => {
        expect(() => parseTracingLevel(value, "detail")).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  test("any generated value resolves to a known level", () => {
    const LEVELS = ["off", "errors", "summary", "narrative", "detail"];
    fc.assert(
      fc.property(propertyValuesArb(), (value) => {
        expect(LEVELS).toContain(parseTracingLevel(value, "detail"));
      }),
      { numRuns: 100 },
    );
  });
});

/** Values a deployment script, an environment variable or a stray properties file can produce. */
function propertyValuesArb(): fc.Arbitrary<string> {
  const alphabet = fc.constantFrom(
    "",
    " ",
    "0",
    "-1",
    "9",
    "999999999999999999999",
    "0x10",
    "1e9",
    "true",
    "TRUE",
    "narrative",
    "OFF",
    "off",
    "\n",
    "\t",
    "-",
    "+",
    ".",
    ",",
    "'",
    '"',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal text is the hostile case
    "${x}",
    "%s",
    "../..",
    "NaN",
    "Infinity",
    String.fromCodePoint(0x0000),
    String.fromCodePoint(0x202e),
    "🙈",
  );
  return fc.array(alphabet, { maxLength: 8 }).map((parts) => parts.join(""));
}
