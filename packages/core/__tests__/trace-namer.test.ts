// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { describe, expect, test } from "vitest";
import type { TraceId } from "../src/span-id-generator.js";
import { humanName } from "../src/trace-namer.js";

function tid(hex: string): TraceId {
  return hex.padEnd(32, "0") as TraceId;
}

describe("humanName", () => {
  test("all-zeros trace produces first word from each array", () => {
    expect(humanName(tid("0000000"))).toBe("red fox runs");
  });

  test("all-f trace produces last word from each array", () => {
    expect(humanName("ffffffffffffffffffffffffffffffff" as TraceId)).toBe("nutty rig fans");
  });

  test("same input always produces same output", () => {
    const id = "abcdef1234567890abcdef1234567890" as TraceId;
    const first = humanName(id);
    const second = humanName(id);
    expect(first).toBe(second);
  });

  test("format matches three lowercase words", () => {
    const id = "1a2b3c4d5e6f7890abcdef1234567890" as TraceId;
    expect(humanName(id)).toMatch(/^[a-z]+ [a-z]+ [a-z]+$/);
  });

  test("each word is 3-6 characters", () => {
    const id = "deadbeefcafebabe1234567890abcdef" as TraceId;
    const words = humanName(id).split(" ");
    expect(words).toHaveLength(3);
    for (const word of words) {
      expect(word.length).toBeGreaterThanOrEqual(3);
      expect(word.length).toBeLessThanOrEqual(6);
    }
  });

  test("1000 varied trace IDs produce high diversity", () => {
    const names = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const hex = (i * 7919).toString(16).padStart(7, "0").padEnd(32, "0") as TraceId;
      names.add(humanName(hex));
    }
    expect(names.size).toBeGreaterThan(900);
  });

  test("only first 7 hex chars matter", () => {
    const a = "abcdef1000000000000000000000000a" as TraceId;
    const b = "abcdef1ffffffffffffffffffffffffe" as TraceId;
    expect(humanName(a)).toBe(humanName(b));
  });
});
