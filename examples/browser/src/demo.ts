// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The demo itself: everything the page shows and does after `app.ts` mounts it.
 *
 * Flow on every click of the button:
 *   trace a Calculator ──► capture the TraceTree ──► render it into the page
 *                                                 ├─► mirror it to the DevTools console
 *                                                 └─► POST it to the collector, report the outcome
 *
 * Library pieces used, and where they come from:
 * - `@narrativetrace/core-web`   — `SyncNarrativeContext` (records events; the browser has no
 *                                  AsyncLocalStorage, so the sync context is the browser choice),
 *                                  `NarrativeTraceConfig`, `renderIndentedText`, `TraceTree`.
 *                                  Importing it also registers the Web Crypto id generator.
 * - `@narrativetrace/proxy`      — `traceObject`: wraps any object in an ES Proxy that reports
 *                                  each method call to the context.
 * - `@narrativetrace/browser`    — `renderToConsole` (console.group tree) and `postToCollector`
 *                                  (fetch POST of the JSON export).
 */

import { postToCollector, renderToConsole } from "@narrativetrace/browser";
import {
  NarrativeTraceConfig,
  renderIndentedText,
  SyncNarrativeContext,
  type TraceTree,
} from "@narrativetrace/core-web";
import { traceObject } from "@narrativetrace/proxy";
import { Calculator } from "./calculator.js";

/**
 * Runs one traced scenario and returns the captured trace.
 *
 * A fresh context per run means each click produces exactly this scenario's trace — nothing
 * accumulates across clicks. The third argument to `traceObject` supplies parameter names
 * (`a`, `b`) so the trace reads `divide(a: 10, b: 2)` instead of `divide(arg0: 10, arg1: 2)`;
 * JavaScript keeps no parameter names at runtime, so they have to be declared.
 */
function runTracedCalculation(): TraceTree {
  const ctx = new SyncNarrativeContext(new NarrativeTraceConfig());
  const calc = traceObject(new Calculator(), ctx, { add: ["a", "b"], divide: ["a", "b"] });
  calc.add(2, 3);
  calc.divide(10, 2);
  try {
    calc.divide(1, 0);
  } catch {
    // The failure is the point: it shows up in the trace as ✗ with the error, and the proxy
    // re-throws it exactly as the untraced Calculator would — tracing never swallows errors.
  }
  // captureTrace() snapshots the recorded events into a tree of TraceNodes (one per call).
  return ctx.captureTrace();
}

export interface DemoOptions {
  /** Where the captured trace is POSTed as JSON. @defaultValue "/traces" (served by the Vite dev middleware) */
  collectorUrl?: string;
}

/**
 * POSTs the trace to the collector and turns the outcome into one human-readable line.
 *
 * `postToCollector` resolves with the `Response` for *any* HTTP status and rejects only when the
 * request itself fails (offline, DNS, CORS), hence the two distinct non-success messages.
 * This never throws: a broken collector must not take the already-rendered trace with it.
 */
async function exportTrace(tree: TraceTree, collectorUrl: string): Promise<string> {
  try {
    const response = await postToCollector(tree, { scenario: "calculator demo" }, collectorUrl);
    return response.ok
      ? `Trace posted to collector (HTTP ${response.status})`
      : `Collector rejected the trace (HTTP ${response.status})`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Collector unavailable — trace shown above (${reason})`;
  }
}

/**
 * Mounts the interactive tracing demo into `root`.
 *
 * INTENT: everything the browser page shows lives here so it can be exercised under jsdom;
 * `app.ts` only wires this to `document`. The `data-testid` attributes are how the tests find
 * the three elements; they have no runtime role.
 *
 * @param root the container that receives the button, the trace panel and the status line
 * @param options see {@link DemoOptions}; tests pass an explicit `collectorUrl`
 */
export function mountDemo(root: HTMLElement, options: DemoOptions = {}): void {
  const collectorUrl = options.collectorUrl ?? "/traces";

  const button = document.createElement("button");
  button.dataset.testid = "run";
  button.textContent = "Run traced calculation";

  // The trace panel: renderIndentedText() output, one traced call per line.
  const trace = document.createElement("pre");
  trace.dataset.testid = "trace";

  // Outcome of the collector POST; filled in asynchronously after each run.
  const status = document.createElement("p");
  status.dataset.testid = "status";

  button.addEventListener("click", () => {
    const tree = runTracedCalculation();
    renderToConsole(tree); // DevTools console (console.group per call with children)
    trace.textContent = renderIndentedText(tree); // in-page text
    exportTrace(tree, collectorUrl).then((text) => {
      status.textContent = text;
    });
  });

  root.append(button, trace, status);
}
