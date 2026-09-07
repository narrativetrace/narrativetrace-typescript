// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { narrativetrace: "src/index.ts" },
  format: ["esm", "iife"],
  globalName: "NarrativeTrace",
  // Bundle the workspace packages in: a single file must not import bare specifiers.
  noExternal: [/^@narrativetrace\//],
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  // Inline the workspace packages' types too: a consumer of this file has none of them installed.
  dts: { resolve: [/^@narrativetrace\//] },
  clean: true,
});
