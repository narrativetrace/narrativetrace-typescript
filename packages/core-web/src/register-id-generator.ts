// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { registerIdGenerator, webCryptoIdGenerator } from "@narrativetrace/core";

/**
 * Pins Web Crypto as the process-wide source of trace and span ids.
 *
 * INTENT: the one job this package's import side effect performs, kept as a named function so
 * the guard below is reachable — and observable — without module-registry surgery. `index.ts`
 * calls it once at load; nothing else has to.
 *
 * `core` already falls back to Web Crypto when no generator is registered, so this is not what
 * makes ids work. It is what makes them *stay* Web Crypto: whatever else a bundle registers
 * later, importing this package is a deliberate statement about which generator the browser
 * runs on.
 *
 * @throws {Error} when the runtime exposes no `globalThis.crypto.getRandomValues`. Deliberately
 * loud: a browser adapter that silently accepted a runtime without Web Crypto would leave the
 * application minting whatever some other registration provides, and unusable trace ids are
 * discovered in a backend, days later.
 */
export function registerWebCryptoIdGenerator(): void {
  const generator = webCryptoIdGenerator();
  if (generator === null) {
    throw new Error("@narrativetrace/core-web requires Web Crypto (globalThis.crypto).");
  }
  registerIdGenerator(generator);
}
