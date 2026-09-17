// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Whether a {@link renderValue}/{@link renderCapture} entry point (`value-renderer.ts`) is
 * executing right now, on this JS thread — the TypeScript twin of Java's `RenderingGuard`
 * (`narrativetrace-core/render/RenderingGuard.java`, thread-local there).
 *
 * INTENT: rendering a parameter or return value can invoke members on it — a `narrativeSummary()`
 * method, a `@narrated`/`@onError` template path — and when the value reached the renderer is
 * itself traced (a `traceObject` proxy, or a class `wrapPrototypeMethods` auto-wrapped), that
 * invocation runs the SAME tracing wrapper a genuine business call runs, opening a span for a call
 * the application never made. Every tracing entry point (`packages/proxy`'s `wrapMethod`,
 * `packages/nestjs`'s `createWrapper`) checks {@link isRenderingInProgress} before doing ANY
 * capture or span work, so a re-entrant call takes the untraced fast path instead — exactly how
 * Java's `AgentRuntime.isActive()` answers `false` while `RenderingGuard.isActive()` is true. This
 * lives in `core`, not either wrapping package, for the same reason the Java guard lives in
 * `narrativetrace-core`: a deployment can have both engines attached to the same objects, and the
 * flag must be shared by call, not by tracing-engine instance (mirrors `redacted-params-registry.ts`,
 * the other piece of shared capture-path state both wrapping packages read without depending on
 * each other).
 *
 * @remarks **Why a plain module-level flag is the correct equivalent of a `ThreadLocal`, not a
 * downgrade:** every call reachable from `renderValue`/`renderCapture` is fully synchronous — the
 * recursive walk in `value-renderer.ts` never `await`s — so the window where this flag reads `true`
 * never spans an event-loop turn. Node's run-to-completion semantics mean no other JS, on any
 * `AsyncLocalStorage`-scoped context, can execute while that window is open, so nothing needs
 * per-thread (there is only one) or per-async-context storage to stay correctly isolated across
 * concurrent work — see `packages/core-node/__tests__/render-reentrancy.test.ts` for the pinned
 * guarantee. A depth counter, not a single boolean, is what makes this safe under nesting: unlike
 * Java's one `ValueRenderer` class, `renderValue` and `renderCapture` are two independent JS entry
 * points, and nothing here proves a call already inside one can never legitimately reach the other
 * (or itself) again — the counter costs nothing and removes the need to prove it.
 */
let renderDepth = 0;

/** Whether a render entry point is currently executing anywhere on the call stack. */
export function isRenderingInProgress(): boolean {
  return renderDepth > 0;
}

/**
 * Runs `fn` with {@link isRenderingInProgress} reporting `true` for its whole (synchronous)
 * duration, restoring the previous depth afterward even if `fn` throws.
 *
 * @llmNote The only intended callers are `renderValue` and `renderCapture` in
 * `value-renderer.ts` — wrapping any other function extends what counts as "rendering" to every
 * tracing entry point that consults {@link isRenderingInProgress}. `renderStructured`
 * (`rendered-value.ts`) does not call this: it never invokes `narrativeSummary()` or a custom
 * `toString()` — only own-enumerable field/getter reads, and a getter is never itself a traced
 * method under either wrapping scheme — so it structurally cannot re-enter tracing and holding the
 * guard for it would only cost nesting depth for no protection.
 */
export function withRenderingGuard<T>(fn: () => T): T {
  renderDepth++;
  try {
    return fn();
  } finally {
    renderDepth--;
  }
}
