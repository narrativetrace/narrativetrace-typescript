// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli-bin.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  // `carrier-locator.ts` finds this package's own root through `import.meta.url`, which esbuild
  // leaves as `undefined` in a CJS bundle (with a warning) — the bundled carrier would then be
  // looked for at `new URL(".", undefined)`, which throws at load time. The shim gives the CJS
  // output a `__filename`-derived answer and the ESM output the real thing. The published `bin`
  // loads the ESM file, so this protects the require() path a consumer may still take.
  shims: true,
});
