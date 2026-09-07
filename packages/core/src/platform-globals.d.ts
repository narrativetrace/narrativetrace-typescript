// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Cross-runtime globals available in Node, browsers, and workers.
// Declared here because core excludes both @types/node and lib.dom
// (via types:[] and lib:[ES2022]) to enforce platform-agnostic code.
// Only the subset core actually uses is declared. Platform-specific
// methods (e.g., Node's Timeout.unref()) are intentionally absent.

// --- Timers ---
declare function setTimeout(callback: () => void, ms?: number): unknown;
declare function clearTimeout(id: unknown): void;
declare function setInterval(callback: () => void, ms?: number): unknown;
declare function clearInterval(id: unknown): void;

// --- High-resolution timing ---
declare const performance: {
  now(): number;
};

// --- Abort signal (used by ForkJoinGroup) ---
declare class AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: string, listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: string, listener: () => void): void;
}
declare class AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}
