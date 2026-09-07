// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsup";

const workspace = (pkg: string) =>
  fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

/**
 * The single-file browser bundle vendored by narrativetrace.ai (TODO item 12).
 *
 * Separate from `tsup.config.ts` because it differs in kind: that one publishes the package
 * (cjs + esm + types, imports left external); this one produces one self-contained ESM file
 * for a page with no build step and no module resolver. Output is deliberate — the website
 * pins it by sha256 in `vendor/MANIFEST.sha256`, so the build must be reproducible.
 */
export default defineConfig({
  entry: { narrativetrace: "src/site-bundle.ts" },
  outDir: "dist/site",
  format: ["esm"],
  platform: "browser",
  target: "es2022",
  dts: false,
  sourcemap: false,
  minify: true,
  treeshake: true,
  clean: true,
  noExternal: [/@narrativetrace\/.*/],
  // Resolve workspace packages to their SOURCE, not their published entry.
  //
  // `noExternal` inlines them, but resolution still runs through each package's `exports`
  // field, which points at `./dist/index.js`. That made the bundle a function of whatever
  // each `dist/` last contained rather than of the source tree — so a fixed source file
  // could be missing from a freshly built artifact, with no error and no warning. It cost
  // real debugging time once (a tree-builder fix that "had no effect"), and it quietly
  // defeats the website's sha256 pin: a digest is tamper-evidence, not freshness evidence,
  // and it will faithfully record the wrong bytes.
  //
  // Aliasing to source removes the failure mode instead of sequencing around it, and makes
  // the artifact a pure function of the source tree — the property the pin is trying to
  // assert. Keep this list in sync with what `src/site-bundle.ts` reaches, transitively.
  esbuildOptions(options) {
    options.alias = {
      ...options.alias,
      "@narrativetrace/core": workspace("core"),
      "@narrativetrace/core-web": workspace("core-web"),
      "@narrativetrace/proxy": workspace("proxy"),
    };
  },
});
