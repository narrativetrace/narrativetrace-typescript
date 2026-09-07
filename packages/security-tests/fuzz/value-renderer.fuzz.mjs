// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
// Tier B fuzz target 1 of 2: the value renderer, with the redaction oracle.
//
// INTENT: Jazzer.js cannot execute a TypeScript fuzz target directly (see
// docs/fuzz-targets.md, "Directly executing fuzz targets written in TypeScript is NOT
// supported"), so this is plain ESM importing the already-built @narrativetrace/core
// package rather than this package's own TS sources. One target, one implementation:
// __tests__/fuzz-regression.test.ts imports this same file (no jazzer-specific API used
// here, so it runs equally well under plain Node) and replays the seed corpus through it
// on every `pnpm run check`.
//
// Scope, honestly stated: Java's ValueRendererFuzzTest drives FuzzedDataProvider to pick
// a corpus shape or a generated wrapper stack/depth/width. This target is narrower — the
// fuzzer's bytes become the sentinel itself, planted behind a fixed @notTraced-shaped
// wrapper — because coverage-guided fuzzing earns its keep on the *byte* space (an
// escaper's untaken branch), and the *shape* space is already covered more thoroughly by
// Tier A's fast-check properties (packages/security-tests/__tests__/
// value-renderer-redaction.prop.test.ts), which build real graphs, not just one wrapper.
import { renderStructured, renderValue } from "@narrativetrace/core";

class Secret {
  static notTraced = ["secret"];
  constructor(secret) {
    this.secret = secret;
  }
}

export function fuzz(data) {
  const text = data.toString("utf-8");
  if (text.length === 0) return;

  const graph = { label: "probe", held: new Secret(text) };
  const flat = renderValue(graph);
  if (flat.includes(text)) {
    throw new Error("renderValue leaked a redacted value");
  }
  const structured = JSON.stringify(renderStructured(graph));
  if (structured.includes(text)) {
    throw new Error("renderStructured leaked a redacted value");
  }
}
