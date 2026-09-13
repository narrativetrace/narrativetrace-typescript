// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Entry-point kind's probe (docs-vs-published-gate-2026-09-12.md §2): an HTTP presence check
// against the real npm registry, no install needed. Imported in-process by contract-probe/run.ts
// (never spawned as its own process). The classification below is the same one
// tools/verify-publication-registry.ts uses for the post-publish check — duplicated here in
// plain JS (three lines) rather than imported across a .mjs->.ts boundary: tsx's loader hook does
// not reliably rewrite a `.js`-suffixed relative import made FROM an already-native ESM module,
// only from the tsx-loaded entry point's own graph.
const REGISTRY_BASE = "https://registry.npmjs.org";

/** `checkEntryPointOnRegistry("@narrativetrace/core", "0.1.1")` -> "PRESENT" | "LAGGING" | "MISSING". */
export async function checkEntryPointOnRegistry(coordinate, version) {
  const response = await fetch(`${REGISTRY_BASE}/${coordinate}/${version}`);
  if (response.status === 200) return "PRESENT";
  if (response.status === 404) return "LAGGING";
  return "MISSING";
}
