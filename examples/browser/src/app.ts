// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
/**
 * Browser entry point for the NarrativeTrace example.
 *
 * `index.html` loads this file through `<script type="module" src="/src/app.ts">`. In
 * development the Vite dev server transpiles the TypeScript on request; `vite build` bundles it
 * into `dist/assets/`. Either way this module runs once, when the page loads.
 *
 * Its only jobs are:
 * 1. import `@narrativetrace/core-web` — for its side effect. That package re-exports
 *    `@narrativetrace/core` and registers the Web Crypto trace/span id generator. Without it (or
 *    `@narrativetrace/core-node` on Node) the first traced call throws
 *    "No IdGenerator registered".
 * 2. hand the `<div id="app">` from `index.html` to {@link mountDemo}, which owns everything the
 *    page shows and is the part covered by the tests.
 */
import "@narrativetrace/core-web";
import { mountDemo } from "./demo.js";

const app = document.getElementById("app");
if (!app) throw new Error('index.html must contain <div id="app">');
mountDemo(app);
