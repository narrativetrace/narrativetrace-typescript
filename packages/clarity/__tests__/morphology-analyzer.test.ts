// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import { analyzeMorphology } from "../src/morphology-analyzer.js";

describe("MorphologyAnalyzer", () => {
  test("detects nouns by suffix", () => {
    expect(analyzeMorphology("validation")).toBe("noun");
    expect(analyzeMorphology("payment")).toBe("noun");
    expect(analyzeMorphology("darkness")).toBe("noun");
    expect(analyzeMorphology("activity")).toBe("noun");
    expect(analyzeMorphology("tolerance")).toBe("noun");
    expect(analyzeMorphology("processor")).toBe("noun");
  });

  test("detects verbs by suffix", () => {
    expect(analyzeMorphology("validate")).toBe("verb");
    expect(analyzeMorphology("simplify")).toBe("verb");
    expect(analyzeMorphology("authorize")).toBe("verb");
    expect(analyzeMorphology("advertise")).toBe("verb");
  });

  test("detects adjectives by suffix", () => {
    expect(analyzeMorphology("readable")).toBe("adjective");
    expect(analyzeMorphology("useful")).toBe("adjective");
    expect(analyzeMorphology("careless")).toBe("adjective");
    expect(analyzeMorphology("dangerous")).toBe("adjective");
    expect(analyzeMorphology("active")).toBe("adjective");
    expect(analyzeMorphology("flexible")).toBe("adjective");
  });

  test("returns unknown for tokens without recognizable suffix", () => {
    expect(analyzeMorphology("data")).toBe("unknown");
    expect(analyzeMorphology("stock")).toBe("unknown");
    expect(analyzeMorphology("graph")).toBe("unknown");
  });

  test("returns unknown for short tokens", () => {
    expect(analyzeMorphology("go")).toBe("unknown");
    expect(analyzeMorphology("id")).toBe("unknown");
  });

  test("returns unknown for empty string", () => {
    expect(analyzeMorphology("")).toBe("unknown");
  });

  test("detects all noun suffix patterns", () => {
    expect(analyzeMorphology("discussion")).toBe("noun");
    expect(analyzeMorphology("adjustment")).toBe("noun");
    expect(analyzeMorphology("weakness")).toBe("noun");
    expect(analyzeMorphology("complexity")).toBe("noun");
    expect(analyzeMorphology("insurance")).toBe("noun");
    expect(analyzeMorphology("preference")).toBe("noun");
    expect(analyzeMorphology("observer")).toBe("noun");
    expect(analyzeMorphology("processor")).toBe("noun");
    expect(analyzeMorphology("cyclist")).toBe("noun");
    expect(analyzeMorphology("mechanism")).toBe("noun");
  });

  test("detects all verb suffix patterns", () => {
    expect(analyzeMorphology("activate")).toBe("verb");
    expect(analyzeMorphology("specify")).toBe("verb");
    expect(analyzeMorphology("organize")).toBe("verb");
    expect(analyzeMorphology("supervise")).toBe("verb");
  });

  test("detects all adjective suffix patterns", () => {
    expect(analyzeMorphology("accessible")).toBe("adjective");
    expect(analyzeMorphology("powerful")).toBe("adjective");
    expect(analyzeMorphology("fearless")).toBe("adjective");
    expect(analyzeMorphology("generous")).toBe("adjective");
    expect(analyzeMorphology("creative")).toBe("adjective");
  });

  test("requires token longer than suffix", () => {
    // "er" is 2 chars, so a 2-char token shouldn't match
    expect(analyzeMorphology("er")).toBe("unknown");
  });
});
