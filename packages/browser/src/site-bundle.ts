// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * The bundle entry for narrativetrace.ai's in-browser live trace demo.
 *
 * INTENT: one ESM file the website vendors and serves from its own origin, carrying the
 * tracer and its renderers and **nothing that can reach the network**. That site's privacy
 * invariant is that no third party is contacted before the visitor allows it; a file it
 * serves must therefore contain no request-making code at all, not even unreachable code.
 *
 * This is why the entry is not `./index.ts`: that one re-exports `postToCollector` and
 * `tracedFetch`. Excluding them here means they are absent from the built artifact rather
 * than merely unused in it — there is no dead network code in the site's `vendor/` for a
 * reader (or an auditor) to have to reason about.
 *
 * Everything exported below is pure computation over the event stream: capture, assemble,
 * render — see narrativetrace.ai's live trace demo for the page that consumes it.
 */

// Importing core-web (not core) is load-bearing: its module side effect registers the Web
// Crypto id generator, so trace and span ids are real random ids in the browser.
export {
  BufferedEventConsumer,
  DualPathPipeline,
  exportJson,
  humanName,
  NarrativeTraceConfig,
  renderIndentedText,
  renderMarkdown,
  renderProse,
  SyncNarrativeContext,
} from "@narrativetrace/core-web";
export { narrated, notTraced, onError, traced, traceObject } from "@narrativetrace/proxy";
export { renderToConsole } from "./console-renderer.js";
