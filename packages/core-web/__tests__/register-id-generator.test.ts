// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { generateSpanId, generateTraceId } from "@narrativetrace/core";
import { afterEach, describe, expect, test } from "vitest";
import { registerWebCryptoIdGenerator } from "../src/register-id-generator.js";

const originalCrypto = globalThis.crypto;

function withCrypto(value: unknown): void {
  Object.defineProperty(globalThis, "crypto", { value, configurable: true });
}

afterEach(() => {
  withCrypto(originalCrypto);
  // Leave the suite with the generator this package promises, whatever a test just did to it.
  registerWebCryptoIdGenerator();
});

describe("registerWebCryptoIdGenerator", () => {
  test("registers a generator that mints W3C-shaped ids", () => {
    registerWebCryptoIdGenerator();

    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
    expect(generateSpanId()).toMatch(/^[0-9a-f]{16}$/);
  });

  test("registers the runtime's own randomness, not a stand-in", () => {
    // Proven by substituting a recognisable source: whatever it produces has to come out.
    withCrypto({ getRandomValues: (buffer: Uint8Array) => buffer.fill(0xab) });

    registerWebCryptoIdGenerator();

    expect(generateTraceId()).toBe("ab".repeat(16));
  });

  test("returns without throwing when the runtime has Web Crypto", () => {
    // The other side of the guard: a supported runtime must load the package silently.
    expect(() => registerWebCryptoIdGenerator()).not.toThrow();
  });

  test("throws rather than accepting a runtime with no Web Crypto", () => {
    withCrypto(undefined);

    expect(() => registerWebCryptoIdGenerator()).toThrow(
      "@narrativetrace/core-web requires Web Crypto (globalThis.crypto).",
    );
  });

  test("throws when crypto exists but cannot produce randomness", () => {
    // A shimmed or partial `crypto` is the realistic failure, not an absent one.
    withCrypto({ subtle: {} });

    expect(() => registerWebCryptoIdGenerator()).toThrow("requires Web Crypto");
  });

  test("leaves the previously registered generator in place when it throws", () => {
    registerWebCryptoIdGenerator();
    withCrypto(undefined);

    expect(() => registerWebCryptoIdGenerator()).toThrow();
    expect(generateTraceId()).toMatch(/^[0-9a-f]{32}$/);
  });
});
