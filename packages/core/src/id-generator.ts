// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import type { SpanId, TraceId } from "./span-id-generator.js";

/**
 * Platform-specific source of trace and span identifiers.
 *
 * INTENT: `core` stays platform-agnostic and delegates ID minting to a generator
 * registered by a runtime adapter (`core-node` / `core-web`), which pick the fastest
 * available RNG for their environment.
 */
export interface IdGenerator {
  traceId(): TraceId;
  spanId(): SpanId;
}

/** The one capability the fallback needs, named without depending on the DOM lib. */
interface RandomSource {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
}

let generator: IdGenerator | null = null;
let fallback: IdGenerator | null = null;

/**
 * An {@link IdGenerator} backed by Web Crypto, or `null` where the runtime has none.
 *
 * INTENT: the neutral fallback every modern runtime can satisfy — browsers, Node >= 19,
 * Deno, Bun and workers all expose `globalThis.crypto.getRandomValues`. It exists so a
 * module shared between server and client rendering does not have to know which runtime
 * shim the application imported; `core-node` and `core-web` remain the explicit opt-in.
 *
 * An all-zero trace or span id is invalid per W3C Trace Context, so the last byte is
 * forced to 1 on the (astronomically unlikely) all-zero draw.
 */
export function webCryptoIdGenerator(): IdGenerator | null {
  // Structurally typed rather than via the DOM `Crypto` type: core compiles without the
  // DOM lib so it stays usable from Node, workers and the browser alike.
  const webCrypto = (globalThis as { crypto?: RandomSource }).crypto;
  if (typeof webCrypto?.getRandomValues !== "function") return null;
  const hex = (bytes: number): string => {
    const buf = new Uint8Array(bytes);
    webCrypto.getRandomValues(buf);
    if (buf.every((b) => b === 0)) buf[bytes - 1] = 1;
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  };
  return { traceId: () => hex(16) as TraceId, spanId: () => hex(8) as SpanId };
}

/**
 * Installs the process-wide {@link IdGenerator}. Called once at startup by a runtime
 * adapter; a later call replaces the previous generator.
 *
 * @param gen the platform generator to use for all subsequent id minting.
 */
export function registerIdGenerator(gen: IdGenerator): void {
  generator = gen;
}

/**
 * Returns the registered {@link IdGenerator}.
 *
 * Falls back to {@link webCryptoIdGenerator} when nothing was registered explicitly.
 *
 * @throws {Error} only when nothing is registered AND the runtime has no Web Crypto.
 */
export function getIdGenerator(): IdGenerator {
  if (generator) return generator;
  fallback ??= webCryptoIdGenerator();
  if (fallback) return fallback;
  throw new Error(
    "No IdGenerator registered and this runtime has no Web Crypto. " +
      "Import @narrativetrace/core-node or @narrativetrace/core-web.",
  );
}

/** Clears the registered generator. Primarily a test-isolation hook. */
export function resetIdGenerator(): void {
  generator = null;
  fallback = null;
}
