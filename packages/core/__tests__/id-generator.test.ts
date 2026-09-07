// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, describe, expect, test } from "vitest";
import {
  getIdGenerator,
  type IdGenerator,
  registerIdGenerator,
  resetIdGenerator,
} from "../src/id-generator.js";
import {
  generateSpanId,
  generateTraceId,
  type SpanId,
  type TraceId,
} from "../src/span-id-generator.js";

afterEach(() => resetIdGenerator());

describe("IdGenerator registration", () => {
  test("getIdGenerator falls back to Web Crypto when nothing is registered", () => {
    // A shared module under SSR cannot know which runtime shim the app imported.
    // Every modern runtime (browsers, Node >= 19, Deno, Bun, workers) has Web Crypto,
    // so the neutral core resolves one itself rather than throwing.
    resetIdGenerator();

    expect(getIdGenerator().traceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(getIdGenerator().spanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  test("an explicitly registered generator still wins over the fallback", () => {
    resetIdGenerator();
    const gen: IdGenerator = {
      traceId: () => "aabbccdd11223344aabbccdd11223344" as TraceId,
      spanId: () => "1122334455667788" as SpanId,
    };

    registerIdGenerator(gen);

    expect(getIdGenerator()).toBe(gen);
  });

  test("the fallback never mints an all-zero id, which W3C defines as invalid", () => {
    resetIdGenerator();
    const zeroing = {
      getRandomValues: <T extends ArrayBufferView>(buf: T): T => {
        new Uint8Array(buf.buffer).fill(0);
        return buf;
      },
    };
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: zeroing, configurable: true });
    try {
      expect(getIdGenerator().traceId()).not.toBe("0".repeat(32));
      expect(getIdGenerator().spanId()).not.toBe("0".repeat(16));
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
      resetIdGenerator();
    }
  });

  test("getIdGenerator throws only when the runtime has no Web Crypto at all", () => {
    resetIdGenerator();
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      expect(() => getIdGenerator()).toThrow("no Web Crypto");
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
      resetIdGenerator();
    }
  });

  test("registerIdGenerator sets the generator and getIdGenerator returns it", () => {
    const gen: IdGenerator = {
      traceId: () => "aabbccdd11223344aabbccdd11223344" as TraceId,
      spanId: () => "1122334455667788" as SpanId,
    };
    registerIdGenerator(gen);
    expect(getIdGenerator()).toBe(gen);
  });

  test("generateTraceId delegates to registered generator", () => {
    registerIdGenerator({
      traceId: () => "ffffffffffffffffffffffffffffffff" as TraceId,
      spanId: () => "0000000000000001" as SpanId,
    });
    expect(generateTraceId()).toBe("ffffffffffffffffffffffffffffffff");
  });

  test("generateSpanId delegates to registered generator", () => {
    registerIdGenerator({
      traceId: () => "00000000000000000000000000000001" as TraceId,
      spanId: () => "aaaaaaaaaaaaaaaa" as SpanId,
    });
    expect(generateSpanId()).toBe("aaaaaaaaaaaaaaaa");
  });
});
