// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Single-file NarrativeTrace for plain JavaScript pages.
 *
 * INTENT: the regular packages are ESM/CJS files that import each other by bare specifier
 * (`"@narrativetrace/core"`), which only bundlers and Node understand. This entry re-exports the
 * browser-facing API of three packages and tsup bundles it — dependencies included — into
 * `dist/narrativetrace.js` (ES module: `import { traceObject } from "./narrativetrace.js"`) and
 * `dist/narrativetrace.global.js` (classic script: `window.NarrativeTrace.traceObject`).
 * Importing either registers the Web Crypto id generator, so no further setup is needed.
 */
export * from "@narrativetrace/browser";
export * from "@narrativetrace/core-web";
export * from "@narrativetrace/proxy";
