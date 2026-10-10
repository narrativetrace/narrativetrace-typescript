// SPDX-License-Identifier: BUSL-1.1
// Licensed under the Business Source License 1.1 (see LICENSE); Change Date: four years from publication; Change License: Apache-2.0
// Copyright (c) 2026 Empower Agile
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = join(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  peerDependencies?: Record<string, string>;
};

/**
 * Found 2026-10-10: rxjs was only a devDependency, so tsup bundled a private copy of rxjs (~380 KB)
 * into the published package — a second rxjs beside the application's own. Every Angular
 * application already depends on rxjs; this package must use that one.
 */
describe("@narrativetrace/angular ships no copy of its host framework", () => {
  test("rxjs is a peer dependency, as the Angular packages are", () => {
    expect(manifest.peerDependencies?.rxjs).toBeDefined();
  });

  test.each(["index.js", "index.cjs"])("dist/%s imports rxjs instead of carrying it", (file) => {
    const built = readFileSync(join(root, "dist", file), "utf8");
    expect(built).toMatch(/(from|require\()\s*["']rxjs["']/);
    expect(built).not.toContain("class Subscriber");
  });
});
