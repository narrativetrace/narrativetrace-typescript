// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { generateSpanId, generateTraceId, isValidSpanId, isValidTraceId } from "../src/index.js";

describe("core-web ID generation", () => {
  test("generateTraceId produces a valid 32-hex trace ID", () => {
    const id = generateTraceId();
    expect(isValidTraceId(id)).toBe(true);
  });

  test("generateSpanId produces a valid 16-hex span ID", () => {
    const id = generateSpanId();
    expect(isValidSpanId(id)).toBe(true);
  });

  test("generated IDs are unique", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId()));
    expect(ids.size).toBe(100);
  });
});

describe("core-web ID generation with all-zero randomness", () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(globalThis, "crypto", {
      value: {
        getRandomValues(buffer: Uint8Array) {
          buffer.fill(0);
          return buffer;
        },
      },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
    });
  });

  test("all-zero randomness still produces valid IDs", async () => {
    const mod = await import("../src/index.js");

    const traceId = mod.generateTraceId();
    const spanId = mod.generateSpanId();

    expect(mod.isValidTraceId(traceId)).toBe(true);
    expect(mod.isValidSpanId(spanId)).toBe(true);
  });
});

describe("core-web entry point without Web Crypto", () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => vi.resetModules());

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: originalCrypto,
      configurable: true,
    });
  });

  test("importing the package fails loudly rather than minting weak ids", async () => {
    // The browser adapter exists to pin the Web Crypto generator. A runtime without it
    // must not silently fall through to whatever else registered a generator — that is
    // how unusable trace ids reach a backend.
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });

    await expect(import("../src/index.js")).rejects.toThrow(
      "@narrativetrace/core-web requires Web Crypto (globalThis.crypto).",
    );
  });

  test("importing the package succeeds once Web Crypto is present", async () => {
    // The other side of the same guard: the check is on the runtime, not on the import
    // order, so a runtime that does have Web Crypto loads normally.
    const mod = await import("../src/index.js");

    expect(mod.isValidTraceId(mod.generateTraceId())).toBe(true);
  });
});
